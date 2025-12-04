const WebSocket = require('ws');
const express = require('express');

const app = express();
const PORT = 5000;

// === CẤU HÌNH ===
// Token và URL của bạn
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};

// Biến toàn cục lưu dữ liệu
let latestHistoryData = { htr: [] };
let currentSessionId = 0;
let wsConnection = null;
let pingInterval = null;
let keepAliveInterval = null;

// === CÁC HÀM XỬ LÝ DỮ LIỆU ===

// Định dạng dữ liệu trả về API
function formatDiceData(htrData) {
    const formattedData = [];
    if (!Array.isArray(htrData)) return [];

    // Lấy tối đa 100 phiên gần nhất, đảo ngược để mới nhất lên đầu
    const limitData = htrData.slice(-100).reverse();

    for (const item of limitData) {
        const d1 = item.d1 || 0;
        const d2 = item.d2 || 0;
        const d3 = item.d3 || 0;
        const sid = item.sid || 0;
        
        const total = d1 + d2 + d3;
        const result = total >= 11 ? "Tài" : "Xỉu";
        
        formattedData.push({
            phien: sid,
            ket_qua_text: `${d1}-${d2}-${d3} (${total}) - ${result}`,
            xuc_xac_1: d1,
            xuc_xac_2: d2,
            xuc_xac_3: d3,
            tong: total,
            ket_qua: result
        });
    }
    return formattedData;
}

// === API ROUTES ===
app.get('/api/his', (req, res) => {
    try {
        const formattedData = formatDiceData(latestHistoryData.htr || []);
        res.json({
            status: "success",
            total_records: formattedData.length,
            data: formattedData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sun', (req, res) => {
    try {
        const htrData = latestHistoryData.htr || [];
        let formattedData = {
            status: "waiting",
            phien_hien_tai: currentSessionId,
            message: "Chưa có dữ liệu lịch sử"
        };
        
        if (htrData.length > 0) {
            const latestItem = htrData[htrData.length - 1]; // Phần tử cuối mảng là mới nhất
            const d1 = latestItem.d1 || 0;
            const d2 = latestItem.d2 || 0;
            const d3 = latestItem.d3 || 0;
            const total = d1 + d2 + d3;
            
            formattedData = {
                phien: latestItem.sid,
                xuc_xac_1: d1,
                xuc_xac_2: d2,
                xuc_xac_3: d3,
                tong: total,
                ket_qua: total >= 11 ? "Tài" : "Xỉu",
                phien_hien_tai: currentSessionId // Phiên đang quay (chưa xổ)
            };
        }
        
        res.json(formattedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// === WEBSOCKET LOGIC ===

function sendCmd1005(ws) {
    // Lệnh yêu cầu lấy lịch sử cầu
    const message1005 = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message1005));
    }
}

function connectWebSocket() {
    console.log('🔌 Đang kết nối WebSocket...');
    
    // Reset connection variables
    if (pingInterval) clearInterval(pingInterval);
    if (keepAliveInterval) clearInterval(keepAliveInterval);

    const ws = new WebSocket(WEBSOCKET_URL, {
        headers: WS_HEADERS,
        rejectUnauthorized: false
    });
    
    wsConnection = ws;
    
    ws.on('open', function open() {
        console.log('✅ WebSocket Connected!');
        
        // 1. Gửi gói tin xác thực
        const authMsg = [1,"MiniGame","GM_apivopnha","WangLin",{"info":"{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}","signature":"45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"}];
        ws.send(JSON.stringify(authMsg));

        // 2. Gửi lệnh lấy dữ liệu sau 1s
        setTimeout(() => {
            sendCmd1005(ws); // Lấy lịch sử
            
            // Vào sảnh
            const msg10001 = [6,"MiniGame","lobbyPlugin", { cmd: 10001 }];
            ws.send(JSON.stringify(msg10001));
        }, 1000);

        // 3. Setup Ping (Giữ kết nối server) - 15s/lần
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 15000);

        // 4. Setup Lấy dữ liệu định kỳ (để cập nhật nếu socket không push) - 10s/lần
        keepAliveInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) sendCmd1005(ws);
        }, 10000);
    });
    
    ws.on('message', function message(data) {
        try {
            const strData = data.toString();
            // Bỏ qua tin nhắn ping/pong quá ngắn
            if (strData.length < 5) return;

            const parsed = JSON.parse(strData);
            
            // Xử lý gói tin dạng mảng [Type, Data]
            if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0] === 5) {
                const payload = parsed[1];
                const cmd = payload.cmd;

                switch (cmd) {
                    case 1005: // === KẾT QUẢ LỊCH SỬ CẦU ===
                        if (payload.htr) {
                            latestHistoryData.htr = payload.htr;
                            const lastPhien = payload.htr[payload.htr.length - 1];
                            console.log(`📥 [CMD 1005] Đã cập nhật ${payload.htr.length} phiên. Mới nhất: #${lastPhien.sid} -> ${lastPhien.d1+lastPhien.d2+lastPhien.d3}`);
                        }
                        break;

                    case 1008: // === TRẠNG THÁI PHIÊN HIỆN TẠI (Đang quay) ===
                        // Gói tin này chứa Session ID (sid) đang chạy
                        if (payload.sid) {
                            if (currentSessionId !== payload.sid) {
                                currentSessionId = payload.sid;
                                console.log(`🔄 [CMD 1008] Chuyển sang phiên mới: #${currentSessionId}`);
                                // Khi sang phiên mới, gọi ngay lệnh lấy lịch sử để cập nhật kết quả phiên cũ
                                sendCmd1005(ws);
                            }
                        }
                        break;

                    case 1011: // Chat Message -> BỎ QUA LOG
                        break;
                    
                    case 10000: // Jackpot Update -> BỎ QUA LOG
                        break;

                    case 10001: // Login Lobby Success
                        console.log('👋 Đã vào sảnh MiniGame thành công');
                        break;

                    default:
                        // Log các cmd lạ để debug nếu cần, nhưng hạn chế spam
                        // console.log(`❓ Unknown CMD: ${cmd}`);
                        break;
                }
            }
        } catch (e) {
            console.error('JSON Parse Error:', e.message);
        }
    });
    
    ws.on('close', function close() {
        console.log('🔴 WebSocket Disconnected. Reconnecting in 3s...');
        wsConnection = null;
        setTimeout(connectWebSocket, 3000);
    });
    
    ws.on('error', function error(err) {
        console.error('❌ WebSocket Error:', err.message);
    });
}

// === KHỞI ĐỘNG SERVER ===
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 API History: http://localhost:${PORT}/api/his`);
    console.log(`🔗 API Current: http://localhost:${PORT}/api/sun`);
    connectWebSocket();
});

process.on('SIGINT', () => {
    if (wsConnection) wsConnection.close();
    process.exit();
});
