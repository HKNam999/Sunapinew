const WebSocket = require('ws');
const express = require('express');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = 5000;

// Biến toàn cục để lưu trữ dữ liệu
let latestHistoryData = { htr: [] };
let currentSessionId = 2884086;
let wsConnection = null;
let authData = null;

// Hàm lấy thông tin auth từ API
async function getAuthData() {
    try {
        console.log('🔄 Đang lấy thông tin auth từ API...');
        const response = await axios.get('https://taixiu-database-default-rtdb.firebaseio.com/token.json', {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000
        });

        if (!response.data || !response.data.data || !response.data.data.fullData) {
            throw new Error('Dữ liệu auth không hợp lệ');
        }

        authData = response.data.data.fullData;
        console.log('✅ Lấy thông tin auth thành công');
        console.log(`👤 Username: ${authData[2]}`);
        return authData;
    } catch (error) {
        console.error('❌ Lỗi khi lấy thông tin auth:', error.message);
        return null;
    }
}

// Hàm định dạng dữ liệu xúc xắc
function formatDiceData(htrData) {
    const formattedData = [];
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// Hàm gửi command 1005
function sendCmd1005(ws) {
    const message1005 = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message1005));
        console.log(`🔄 Đã gửi message 1005 - ${new Date().toLocaleTimeString()}`);
    }
}

// Hàm debug cấu trúc dữ liệu
function debugDataStructure(data) {
    console.log("=== DEBUG DATA STRUCTURE ===");
    if (Array.isArray(data)) {
        console.log(`Data là array với ${data.length} phần tử`);
        data.forEach((item, index) => {
            console.log(`  [${index}]: ${typeof item} - ${JSON.stringify(item).substring(0, 100)}...`);
        });
    } else if (typeof data === 'object' && data !== null) {
        console.log(`Data là object với ${Object.keys(data).length} keys`);
        Object.keys(data).forEach(key => {
            console.log(`  '${key}': ${typeof data[key]}`);
        });
    }
    console.log("=== END DEBUG ===");
}

// Hàm bắt đầu keep-alive
function startKeepAlive(ws) {
    if (ws.keepAliveInterval) clearInterval(ws.keepAliveInterval);
    ws.lastMessageTime = Date.now();
    
    ws.keepAliveInterval = setInterval(() => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime > 45000) {
                console.log('⚠️ WebSocket treo (no messages for 45s), reconnecting...');
                ws.terminate();
                return;
            }

            if (ws.readyState === WebSocket.OPEN) {
                sendCmd1005(ws);
                ws.ping();
            } else if (ws.readyState !== WebSocket.CONNECTING) {
                console.log('❌ Kết nối không sẵn sàng, reconnecting...');
                ws.terminate();
            }
        } catch (error) {
            console.error('❌ Lỗi keep-alive:', error.message);
        }
    }, 15000);
}

// Hàm kết nối WebSocket
async function connectWebSocket() {
    try {
        if (wsConnection) {
            console.log('🧹 Cleaning up old connection...');
            wsConnection.removeAllListeners();
            if (wsConnection.keepAliveInterval) clearInterval(wsConnection.keepAliveInterval);
            wsConnection.terminate();
            wsConnection = null;
        }

        await getAuthData();
        if (!authData) {
            console.log('❌ Không thể lấy thông tin auth, thử lại sau 5 giây...');
            setTimeout(connectWebSocket, 5000);
            return;
        }

        const token = JSON.parse(authData[4].info).wsToken;
        const url = `wss://websocket.azhkthg1.net/websocket?token=${token}`;
        console.log('🔌 Đang kết nối WebSocket...');

        const ws = new WebSocket(url, {
            headers: {
                "Origin": "https://web.sunwin.vin",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
            },
            rejectUnauthorized: false,
            handshakeTimeout: 15000
        });

        wsConnection = ws;

        const connectionTimeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                console.log('❌ Kết nối WebSocket timeout (20s), terminate...');
                ws.terminate();
            }
        }, 20000);

        ws.on('open', function open() {
            clearTimeout(connectionTimeout);
            console.log('### ✅ Kết nối mở thành công ###');
            ws.send(JSON.stringify(authData));
            
            setTimeout(() => {
                sendCmd1005(ws);
                setTimeout(() => {
                    const message10001 = [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }];
                    ws.send(JSON.stringify(message10001));
                    startKeepAlive(ws);
                }, 1000);
            }, 2000);
        });

        ws.on('message', function message(data) {
            ws.lastMessageTime = Date.now();
            try {
                const parsedData = JSON.parse(data);
                console.log('📥 Nhận được message:');
                console.log(data.toString());
                console.log('---');

                // Debug cấu trúc dữ liệu
                debugDataStructure(parsedData);

                if (Array.isArray(parsedData) && parsedData.length >= 2 && parsedData[0] === 5) {
                    const mainData = parsedData[1];
                    
                    // Trường hợp 1: Dữ liệu lịch sử từ cmd 1005
                    if (mainData && mainData.htr && Array.isArray(mainData.htr)) {
                        latestHistoryData = { htr: mainData.htr };
                        currentSessionId = mainData.htr[mainData.htr.length - 1].sid;
                        console.log(`🎯 Cập nhật lịch sử từ cmd 1005: ${mainData.htr.length} kết quả`);
                        
                        console.log('📊 3 kết quả gần nhất:');
                        const recentResults = mainData.htr.slice(-3);
                        for (let i = recentResults.length - 1; i >= 0; i--) {
                            const item = recentResults[i];
                            const total = item.d1 + item.d2 + item.d3;
                            console.log(`  🎲 Phiên ${item.sid}: ${item.d1}+${item.d2}+${item.d3}=${total} (${total >= 11 ? 'Tài' : 'Xỉu'})`);
                        }
                    }
                    
                    // Trường hợp 2: Thông báo kết quả phiên mới (thường có sid và res)
                    else if (mainData && mainData.sid && mainData.res && Array.isArray(mainData.res)) {
                        const sid = mainData.sid;
                        const res = mainData.res;
                        const d1 = res[0], d2 = res[1], d3 = res[2];
                        const total = d1 + d2 + d3;
                        
                        // Kiểm tra xem phiên này đã có trong lịch sử chưa để tránh trùng lặp
                        const exists = latestHistoryData.htr.some(item => item.sid === sid);
                        if (!exists) {
                            console.log(`✨ NHẬN ĐƯỢC KẾT QUẢ PHIÊN MỚI: ${sid}`);
                            console.log(`🎲 Kết quả: ${d1}+${d2}+${d3}=${total} (${total >= 11 ? 'Tài' : 'Xỉu'})`);
                            
                            // Thêm vào lịch sử
                            latestHistoryData.htr.push({ d1, d2, d3, sid });
                            currentSessionId = sid;
                            
                            // Sắp xếp lại lịch sử theo sid để đảm bảo đồng bộ
                            latestHistoryData.htr.sort((a, b) => a.sid - b.sid);
                            
                            // Giữ tối đa 100 kết quả
                            if (latestHistoryData.htr.length > 100) {
                                latestHistoryData.htr = latestHistoryData.htr.slice(-100);
                            }
                        }
                    }

                    // Trường hợp 3: Kết quả gửi kèm trong cmd 1002 (phiên mới) hoặc các cmd khác
                    if (mainData && mainData.sid) {
                        if (mainData.res && Array.isArray(mainData.res)) {
                            const sid = mainData.sid;
                            const d1 = mainData.res[0], d2 = mainData.res[1], d3 = mainData.res[2];
                            const exists = latestHistoryData.htr.some(item => item.sid === sid);
                            if (!exists) {
                                console.log(`✨ PHÁT HIỆN KẾT QUẢ TRONG CMD ${mainData.cmd || 'UNKNOWN'}: ${sid}`);
                                latestHistoryData.htr.push({ d1, d2, d3, sid });
                                currentSessionId = sid;
                                
                                // Đồng bộ hóa và sắp xếp
                                latestHistoryData.htr.sort((a, b) => a.sid - b.sid);
                                if (latestHistoryData.htr.length > 100) {
                                    latestHistoryData.htr = latestHistoryData.htr.slice(-100);
                                }
                            }
                        }
                        
                        // Đảm bảo currentSessionId luôn là phiên mới nhất
                        if (mainData.sid > currentSessionId) {
                            currentSessionId = mainData.sid;
                        }
                    }
                }
            } catch (e) {
                console.error('❌ Lỗi xử lý message:', e.message);
            }
        });

        ws.on('close', (code) => {
            console.log(`### 🔌 Kết nối đóng (${code}) - Reconnecting immediately... ###`);
            if (ws.keepAliveInterval) clearInterval(ws.keepAliveInterval);
            // Reconnect ngay lập tức để giữ tính liền mạch
            setTimeout(connectWebSocket, 100);
        });

        ws.on('error', (err) => {
            console.error('❌ Lỗi WebSocket:', err.message);
            ws.terminate(); // Sẽ kích hoạt sự kiện 'close'
        });

    } catch (error) {
        console.error('❌ Lỗi connectWebSocket:', error.message);
        setTimeout(connectWebSocket, 5000);
    }
}

// Khởi động server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đã khởi động trên port ${PORT}`);
    connectWebSocket();
});

// Xử lý tắt ứng dụng
process.on('SIGINT', () => {
    if (wsConnection) wsConnection.close();
    process.exit(0);
});
