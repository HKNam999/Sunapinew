const WebSocket = require('ws');
const express = require('express');

const app = express();
const PORT = 5000;

// === CẤU HÌNH ===
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};

// Biến toàn cục để lưu trữ dữ liệu
let latestHistoryData = { htr: [] };
let currentSessionId = 0;
let wsConnection = null;
let pingInterval = null;

// Hàm định dạng dữ liệu xúc xắc (GIỮ NGUYÊN Y HỆT GỐC)
function formatDiceData(htrData) {
    const formattedData = [];
    
    // Đảo ngược thứ tự để hiển thị từ mới nhất đến cũ nhất
    for (let i = htrData.length - 1; i >= 0; i--) {
        const item = htrData[i];
        const d1 = item.d1 || 0;
        const d2 = item.d2 || 0;
        const d3 = item.d3 || 0;
        const sid = item.sid || 0;
        
        const total = d1 + d2 + d3;
        const result = total >= 11 ? "Tài" : "Xỉu";
        
        formattedData.push({
            phien: sid,
            xuc_xac_1: d1,
            xuc_xac_2: d2,
            xuc_xac_3: d3,
            tong: total,
            ket_qua: result
        });
    }
    
    return formattedData;
}

// === API ROUTES (GIỮ NGUYÊN Y HỆT GỐC) ===
app.get('/api/his', (req, res) => {
    try {
        const formattedData = formatDiceData(latestHistoryData.htr || []);
        res.json(formattedData);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

app.get('/api/sun', (req, res) => {
    try {
        const htrData = latestHistoryData.htr || [];
        let formattedData = {};
        
        if (htrData.length > 0) {
            const latestItem = htrData[htrData.length - 1];
            const d1 = latestItem.d1 || 0;
            const d2 = latestItem.d2 || 0;
            const d3 = latestItem.d3 || 0;
            const sid = latestItem.sid || 0;
            
            const total = d1 + d2 + d3;
            const result = total >= 11 ? "Tài" : "Xỉu";
            
            // Logic tính phiên hiện tại: Phiên cuối cùng trong lịch sử + 1
            // Hoặc sử dụng currentSessionId nếu nó lớn hơn sid lịch sử (do cập nhật realtime)
            const nextPhien = (currentSessionId > sid) ? currentSessionId : (sid + 1);

            formattedData = {
                phien: sid,
                xuc_xac_1: d1,
                xuc_xac_2: d2,
                xuc_xac_3: d3,
                tong: total,
                ket_qua: result,
                phien_hien_tai: nextPhien
            };
        }
        
        res.json(formattedData);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// Hàm gửi command 1005 (Lấy lịch sử)
function sendCmd1005(ws) {
    const message1005 = [
        6,
        "MiniGame", 
        "taixiuPlugin",
        {
            cmd: 1005
        }
    ];
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message1005));
    }
}

// Hàm kết nối WebSocket (ĐÃ TỐI ƯU LOGIC)
function connectWebSocket() {
    try {
        console.log('🔌 Đang kết nối WebSocket...');
        
        // Clear interval cũ nếu có
        if (pingInterval) clearInterval(pingInterval);

        const ws = new WebSocket(WEBSOCKET_URL, {
            headers: WS_HEADERS,
            rejectUnauthorized: false
        });
        
        wsConnection = ws;
        
        ws.on('open', function open() {
            console.log('### ✅ Kết nối mở thành công ###');
            
            // 1. Gửi message xác thực
            const authMsg = [
                1, "MiniGame", "GM_apivopnha", "WangLin",
                {
                    "info": "{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}",
                    "signature": "45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"
                }
            ];
            ws.send(JSON.stringify(authMsg));
            
            // 2. Gửi các lệnh lấy dữ liệu và vào sảnh
            setTimeout(() => {
                sendCmd1005(ws);
                
                const message10001 = [
                    6, "MiniGame", "lobbyPlugin", 
                    { cmd: 10001 }
                ];
                ws.send(JSON.stringify(message10001));
            }, 1000);

            // 3. Setup Keep-Alive (Ping) mỗi 15s để giữ kết nối
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                    // Gửi lệnh lấy lịch sử định kỳ để đảm bảo không bị miss
                    sendCmd1005(ws); 
                }
            }, 5000);
        });
        
        ws.on('message', function message(data) {
            try {
                // Parse dữ liệu JSON an toàn
                const strData = data.toString();
                if(strData.length < 5) return; // Bỏ qua tin quá ngắn

                const parsedData = JSON.parse(strData);
                
                // Kiểm tra cấu trúc gói tin [Type, Data]
                if (Array.isArray(parsedData) && parsedData.length >= 2 && parsedData[0] === 5) {
                    const payload = parsedData[1];
                    const cmd = payload.cmd;

                    switch (cmd) {
                        case 1005: // === DỮ LIỆU LỊCH SỬ ===
                            if (payload.htr && Array.isArray(payload.htr)) {
                                latestHistoryData.htr = payload.htr;
                                const lastItem = payload.htr[payload.htr.length - 1];
                                
                                // Cập nhật session ID từ lịch sử nếu chưa có realtime
                                if (lastItem.sid >= currentSessionId) {
                                    currentSessionId = lastItem.sid + 1;
                                }
                                console.log(`✅ [LỊCH SỬ] Đã cập nhật ${payload.htr.length} phiên. Mới nhất: #${lastItem.sid}`);
                            }
                            break;

                        case 1008: // === TRẠNG THÁI PHIÊN HIỆN TẠI (Quan trọng) ===
                            if (payload.sid) {
                                // Nếu phát hiện phiên mới
                                if (payload.sid > currentSessionId) {
                                    console.log(`🔄 [PHIÊN MỚI] Đang chạy phiên: #${payload.sid}`);
                                    currentSessionId = payload.sid;
                                    
                                    // GỌI NGAY lệnh lấy lịch sử để cập nhật kết quả phiên vừa xong
                                    sendCmd1005(ws);
                                }
                            }
                            break;

                        case 1011: // Chat Message -> Bỏ qua để không spam log
                            break;

                        case 10000: // Jackpot -> Bỏ qua
                            break;

                        default:
                            // Các lệnh khác không quan trọng
                            break;
                    }
                }
            } catch (error) {
                // Không in lỗi parse JSON để tránh rác console
            }
        });
        
        ws.on('error', function error(err) {
            console.error('❌ Lỗi WebSocket:', err.message);
        });
        
        ws.on('close', function close(code, reason) {
            console.log('### 🔌 Kết nối đóng. Reconnect sau 3s... ###');
            wsConnection = null;
            setTimeout(connectWebSocket, 3000);
        });
        
    } catch (error) {
        console.error('❌ Lỗi kết nối WebSocket:', error.message);
        setTimeout(connectWebSocket, 5000);
    }
}

// Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đã khởi động trên port ${PORT}`);
    console.log(`📊 Truy cập: http://localhost:${PORT}/api/his`);
    console.log(`🌞 Truy cập: http://localhost:${PORT}/api/sun`);
    
    // Bắt đầu kết nối WebSocket
    connectWebSocket();
});

// Xử lý tắt ứng dụng
process.on('SIGINT', () => {
    console.log('⏹️ Đang dừng ứng dụng...');
    if (wsConnection) {
        wsConnection.close();
    }
    process.exit(0);
});
