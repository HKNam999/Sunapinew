const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// Biến toàn cục để lưu trữ dữ liệu
let latestHistoryData = { htr: [] };
let currentSessionId = 2884086;
let wsConnection = null;
let pingInterval = null;
let reconnectTimeout = null;

// Biến cho kết quả mới nhất
let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "id": "@mrtinhios"
};

// Hàm định dạng dữ liệu xúc xắc
function formatDiceData(htrData) {
    const formattedData = [];
    
    if (!Array.isArray(htrData)) return formattedData;
    
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

// API routes
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
            
            formattedData = {
                phien: sid,
                xuc_xac_1: d1,
                xuc_xac_2: d2,
                xuc_xac_3: d3,
                tong: total,
                ket_qua: result,
                phien_hien_tai: currentSessionId + 1
            };
        }
        
        res.json(formattedData);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// API mới trả về kết quả mới nhất
app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

app.get('/', (req, res) => {
    res.json(apiResponseData);
});

// Hàm debug cấu trúc dữ liệu
function debugDataStructure(data) {
    console.log("=== DEBUG DATA STRUCTURE ===");
    if (Array.isArray(data)) {
        console.log(`Data là array với ${data.length} phần tử`);
        if (data.length > 1 && typeof data[1] === 'object' && data[1] !== null) {
            console.log(`Keys trong data[1]: ${Object.keys(data[1]).join(', ')}`);
            
            // Kiểm tra nếu có trường htr
            if (data[1].htr) {
                console.log(`🎯 PHÁT HIỆN htr: ${JSON.stringify(data[1].htr).substring(0, 200)}...`);
            }
            
            // Kiểm tra các trường khác có thể chứa dữ liệu lịch sử
            const possibleKeys = ['history', 'hist', 'data', 'results', 'htr', 'd1', 'd2', 'd3', 'sid', 'cmd', 'gBB'];
            possibleKeys.forEach(key => {
                if (data[1][key]) {
                    console.log(`🔍 Tìm thấy key '${key}': ${typeof data[1][key]}`);
                }
            });
        }
    } else if (typeof data === 'object') {
        console.log(`Data là object với ${Object.keys(data).length} keys`);
        Object.keys(data).forEach(key => {
            console.log(`  '${key}': ${typeof data[key]}`);
        });
    }
    console.log("=== END DEBUG ===");
}

// Hàm tìm kiếm dữ liệu htr trong object
function findHtrData(obj, path = '') {
    if (!obj || typeof obj !== 'object') return null;
    
    // Nếu obj có trực tiếp htr
    if (obj.htr && Array.isArray(obj.htr)) {
        console.log(`✅ Tìm thấy htr tại: ${path}htr`);
        return obj.htr;
    }
    
    // Tìm kiếm đệ quy
    for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object') {
            const found = findHtrData(obj[key], `${path}${key}.`);
            if (found) return found;
        }
    }
    
    return null;
}

// Hàm gửi command 1005
function sendCmd1005(ws) {
    const message1005 = [
        6,
        "MiniGame", 
        "taixiuPlugin",
        {
            cmd: 1005
        }
    ];
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message1005));
        console.log(`🔄 Đã gửi message 1005 - ${new Date().toLocaleTimeString()}`);
    }
}

// Hàm gửi command yêu cầu lịch sử
function sendHistoryRequest(ws) {
    const historyRequest = [
        6,
        "MiniGame",
        "taixiuPlugin",
        {
            cmd: 1007,
            c: 0,
            sid: currentSessionId
        }
    ];
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(historyRequest));
        console.log(`📤 Đã gửi yêu cầu lịch sử (cmd: 1007) với sid: ${currentSessionId}`);
    }
}

// Hàm bắt đầu keep-alive và ping
function startKeepAliveAndPing(ws) {
    // Keep-alive mỗi 30 giây
    const keepAliveInterval = setInterval(() => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                sendCmd1005(ws);
            } else {
                console.log('❌ Kết nối bị mất, thử kết nối lại...');
                clearInterval(keepAliveInterval);
            }
        } catch (error) {
            console.error('❌ Lỗi trong keep-alive:', error.message);
        }
    }, 30000);
    
    // Ping mỗi 15 giây
    pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
            console.log('[📶] Đã gửi ping');
        }
    }, 15000);
    
    return keepAliveInterval;
}

// Cấu hình WebSocket
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};
const RECONNECT_DELAY = 5000;

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_apivopnha",
        "WangLin",
        {
            "info": "{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}",
            "signature": "45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"
        }
    ]
];

// Hàm xử lý kết quả xúc xắc mới
function processNewDiceResult(cmd, d1, d2, d3, sid, gBB) {
    if (cmd === 1003 && gBB) {
        if (!d1 || !d2 || !d3) return false;

        const total = d1 + d2 + d3;
        const result = (total > 10) ? "Tài" : "Xỉu";

        apiResponseData = {
            "Phien": currentSessionId,
            "Xuc_xac_1": d1,
            "Xuc_xac_2": d2,
            "Xuc_xac_3": d3,
            "Tong": total,
            "Ket_qua": result,
            "id": "@mrtinhios"
        };
        
        console.log(`🎲 Phiên ${apiResponseData.Phien}: ${d1}+${d2}+${d3}=${total} (${result})`);
        
        // Thêm vào lịch sử
        if (!latestHistoryData.htr) latestHistoryData.htr = [];
        latestHistoryData.htr.push({
            sid: currentSessionId,
            d1: d1,
            d2: d2,
            d3: d3
        });
        
        // Giữ chỉ 50 kết quả gần nhất
        if (latestHistoryData.htr.length > 50) {
            latestHistoryData.htr = latestHistoryData.htr.slice(-50);
        }
        
        currentSessionId = null;
        return true;
    }
    return false;
}

// Hàm kết nối WebSocket
function connectWebSocket() {
    try {
        console.log('🔌 Đang kết nối WebSocket...');
        
        if (wsConnection) {
            wsConnection.removeAllListeners();
            wsConnection.close();
        }
        
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        
        const ws = new WebSocket(WEBSOCKET_URL, {
            headers: WS_HEADERS,
            rejectUnauthorized: false
        });
        
        wsConnection = ws;
        
        ws.on('open', function open() {
            console.log('### ✅ Kết nối mở thành công ###');
            
            // Gửi message xác thực đầu tiên
            ws.send(JSON.stringify(initialMessages[0]));
            console.log('📤 Đã gửi message xác thực');
            
            // Đợi một chút rồi gửi các message tiếp theo
            setTimeout(() => {
                sendCmd1005(ws);
                console.log('📤 Đã gửi message 1005');
                
                // Gửi message 10001
                setTimeout(() => {
                    const message10001 = [
                        6,
                        "MiniGame",
                        "lobbyPlugin", 
                        {
                            cmd: 10001
                        }
                    ];
                    
                    ws.send(JSON.stringify(message10001));
                    console.log('📤 Đã gửi message 10001');
                    
                    // Gửi yêu cầu lịch sử
                    setTimeout(() => {
                        sendHistoryRequest(ws);
                    }, 2000);
                    
                    // Bắt đầu keep-alive và ping
                    startKeepAliveAndPing(ws);
                    
                }, 1000);
            }, 2000);
        });
        
        ws.on('pong', () => {
            console.log('[📶] Nhận được pong - Kết nối ổn định');
        });
        
        ws.on('message', function message(data) {
            try {
                const dataString = data.toString();
                // Log rút gọn để dễ đọc
                console.log('📥 Nhận được message:');
                
                const parsedData = JSON.parse(dataString);
                
                // Debug cấu trúc dữ liệu nếu cần
                // debugDataStructure(parsedData);
                
                // Xử lý tất cả các loại message
                if (Array.isArray(parsedData) && parsedData.length >= 2 && parsedData[0] === 5) {
                    const mainData = parsedData[1];
                    
                    if (typeof mainData === 'object' && mainData !== null) {
                        const { cmd, sid, d1, d2, d3, gBB } = mainData;
                        
                        // Cập nhật session ID từ message 1008
                        if (cmd === 1008 && sid) {
                            currentSessionId = sid;
                            console.log(`🆔 Cập nhật sid: ${currentSessionId}`);
                        }
                        
                        // Xử lý kết quả xúc xắc mới từ message 1003
                        if (processNewDiceResult(cmd, d1, d2, d3, currentSessionId, gBB)) {
                            // Nếu đã xử lý kết quả mới, không cần tìm htr nữa
                            return;
                        }
                        
                        // THỬ TÌM KIẾM DỮ LIỆU htr TRONG TOÀN BỘ OBJECT
                        const htrData = findHtrData(mainData);
                        
                        if (htrData && Array.isArray(htrData)) {
                            console.log(`🎯 Đã tìm thấy ${htrData.length} kết quả xúc xắc`);
                            
                            // Cập nhật dữ liệu lịch sử
                            latestHistoryData = { htr: htrData };
                            console.log(`✅ ĐÃ CẬP NHẬT LỊCH SỬ: ${htrData.length} kết quả`);
                            
                            // Cập nhật session ID từ phiên mới nhất
                            if (htrData.length > 0) {
                                // Lấy phiên CUỐI cùng (mới nhất) trong mảng
                                const latestItem = htrData[htrData.length - 1];
                                if (latestItem.sid) {
                                    currentSessionId = latestItem.sid;
                                    console.log(`🆔 Phiên hiện tại cập nhật: ${currentSessionId}`);
                                    
                                    // In thông tin 3 kết quả gần nhất để kiểm tra
                                    console.log('📊 3 kết quả gần nhất (từ mới đến cũ):');
                                    const recentResults = htrData.slice(-3); // Lấy 3 kết quả cuối
                                    for (let i = recentResults.length - 1; i >= 0; i--) {
                                        const item = recentResults[i];
                                        const total = (item.d1 || 0) + (item.d2 || 0) + (item.d3 || 0);
                                        console.log(`  🎲 Phiên ${item.sid}: ${item.d1}+${item.d2}+${item.d3}=${total} (${total >= 11 ? 'Tài' : 'Xỉu'})`);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Lỗi xử lý message:', error.message);
            }
        });
        
        ws.on('error', function error(err) {
            console.error('❌ Lỗi WebSocket:', err.message);
            ws.close();
        });
        
        ws.on('close', function close(code, reason) {
            console.log('### 🔌 Kết nối đóng ###');
            console.log(`Status code: ${code}`);
            console.log(`Reason: ${reason}`);
            console.log('---');
            
            // Dọn dẹp interval
            clearInterval(pingInterval);
            
            // Thử kết nối lại sau 5 giây
            console.log(`🔄 Thử kết nối lại sau ${RECONNECT_DELAY/1000} giây...`);
            reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
        });
        
    } catch (error) {
        console.error('❌ Lỗi kết nối WebSocket:', error.message);
        // Thử kết nối lại sau 5 giây
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
    }
}

// Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đã khởi động trên port ${PORT}`);
    console.log(`📊 Truy cập: http://localhost:${PORT}/api/his để xem lịch sử đầy đủ`);
    console.log(`🌞 Truy cập: http://localhost:${PORT}/api/sun để xem kết quả mới nhất`);
    console.log(`🎲 Truy cập: http://localhost:${PORT}/api/ditmemaysun để xem kết quả mới nhất (format mới)`);
    console.log(`🏠 Truy cập: http://localhost:${PORT} để xem kết quả mới nhất`);
    
    // Bắt đầu kết nối WebSocket
    connectWebSocket();
});

// Xử lý tắt ứng dụng
process.on('SIGINT', () => {
    console.log('⏹️ Đang dừng ứng dụng...');
    if (wsConnection) {
        wsConnection.close();
    }
    clearInterval(pingInterval);
    clearTimeout(reconnectTimeout);
    process.exit(0);
});
