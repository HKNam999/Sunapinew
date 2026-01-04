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
        res.json({
            success: true,
            data: formattedData,
            count: formattedData.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/api/sun', (req, res) => {
    try {
        const htrData = latestHistoryData.htr || [];
        let formattedData = {};

        if (htrData.length > 0) {
            // Lấy kết quả mới nhất (phần tử cuối cùng trong mảng)
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

        res.json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Hàm debug cấu trúc dữ liệu
function debugDataStructure(data) {
    console.log("=== DEBUG DATA STRUCTURE ===");
    if (Array.isArray(data)) {
        console.log(`Data là array với ${data.length} phần tử`);
        data.forEach((item, index) => {
            console.log(`  [${index}]: ${typeof item} - ${JSON.stringify(item).substring(0, 100)}...`);
        });
    } else if (typeof data === 'object') {
        console.log(`Data là object với ${Object.keys(data).length} keys`);
        Object.keys(data).forEach(key => {
            console.log(`  '${key}': ${typeof data[key]}`);
        });
    }
    console.log("=== END DEBUG ===");
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

// Hàm bắt đầu keep-alive
function startKeepAlive(ws) {
    if (ws.keepAliveInterval) clearInterval(ws.keepAliveInterval);
    
    ws.keepAliveInterval = setInterval(() => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                sendCmd1005(ws);
                // Gửi cả ping frame
                ws.ping();
            } else {
                console.log('❌ Kết nối bị mất (keep-alive), thử kết nối lại...');
                clearInterval(ws.keepAliveInterval);
                connectWebSocket();
            }
        } catch (error) {
            console.error('❌ Lỗi trong keep-alive:', error.message);
        }
    }, 20000); // Tăng tần suất lên 20 giây
}

// Hàm kết nối WebSocket
async function connectWebSocket() {
    try {
        // Clear connection cũ nếu có
        if (wsConnection) {
            wsConnection.removeAllListeners();
            if (wsConnection.readyState === WebSocket.OPEN) {
                wsConnection.close();
            }
            wsConnection = null;
        }

        // Lấy thông tin auth trước khi kết nối
        if (!authData) {
            await getAuthData();
        }

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
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
                "Cache-Control": "no-cache",
                "Origin": "https://web.sunwin.vin",
                "Pragma": "no-cache",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
            },
            rejectUnauthorized: false,
            handshakeTimeout: 15000 // Thêm timeout cho handshake
        });

        wsConnection = ws;

        // Thêm timeout cho việc mở kết nối
        const connectionTimeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                console.log('❌ Kết nối WebSocket quá lâu, đang đóng để thử lại...');
                ws.terminate();
            }
        }, 20000);

        ws.on('open', function open() {
            clearTimeout(connectionTimeout);
            console.log('### ✅ Kết nối mở thành công ###');
            // ... (rest of open logic)

            // Gửi message đầu tiên (auth data từ API)
            ws.send(JSON.stringify(authData));
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

                    // Bắt đầu keep-alive
                    startKeepAlive(ws);

                }, 1000);
            }, 2000);
        });

        ws.on('message', function message(data) {
            try {
                const parsedData = JSON.parse(data);
                console.log('📥 Nhận được message:');
                console.log(data.toString());
                console.log('---');

                // Debug cấu trúc dữ liệu
                debugDataStructure(parsedData);

                // Xử lý message type 5 với dữ liệu lịch sử
                if (Array.isArray(parsedData) && parsedData.length >= 2 && parsedData[0] === 5) {
                    const mainData = parsedData[1];

                    if (typeof mainData === 'object' && mainData !== null) {
                        // TRỰC TIẾP truy cập vào trường "htr"
                        if (mainData.htr && Array.isArray(mainData.htr)) {
                            const htrData = mainData.htr;
                            console.log(`🎯 Tìm thấy htr trực tiếp: ${htrData.length} kết quả`);

                            // Cập nhật dữ liệu lịch sử
                            latestHistoryData = { htr: htrData };
                            console.log(`✅ ĐÃ CẬP NHẬT LỊCH SỬ: ${htrData.length} kết quả`);

                            // Cập nhật session ID từ phiên mới nhất
                            if (htrData.length > 0) {
                                // Lấy phiên CUỐI cùng (mới nhất) trong mảng
                                currentSessionId = htrData[htrData.length - 1].sid;
                                console.log(`🆔 Phiên hiện tại cập nhật: ${currentSessionId}`);

                                // In thông tin 3 kết quả gần nhất để kiểm tra
                                console.log('📊 3 kết quả gần nhất (từ mới đến cũ):');
                                const recentResults = htrData.slice(-3); // Lấy 3 kết quả cuối
                                for (let i = recentResults.length - 1; i >= 0; i--) {
                                    const item = recentResults[i];
                                    const total = item.d1 + item.d2 + item.d3;
                                    console.log(`  🎲 Phiên ${item.sid}: ${item.d1}+${item.d2}+${item.d3}=${total} (${total >= 11 ? 'Tài' : 'Xỉu'})`);
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
        });

        ws.on('close', function close(code, reason) {
            console.log('### 🔌 Kết nối đóng ###');
            console.log(`Status code: ${code}`);
            console.log(`Reason: ${reason}`);
            console.log('---');

            // Thử kết nối lại sau 3 giây
            console.log('🔄 Thử kết nối lại sau 3 giây...');
            setTimeout(connectWebSocket, 3000);
        });

        // Ping để giữ kết nối
        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, 20000);

    } catch (error) {
        console.error('❌ Lỗi kết nối WebSocket:', error.message);
        // Thử kết nối lại sau 5 giây
        setTimeout(connectWebSocket, 5000);
    }
}

// Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đã khởi động trên port ${PORT}`);
    console.log(`📊 Truy cập: http://localhost:${PORT}/api/his để xem lịch sử đầy đủ`);
    console.log(`🌞 Truy cập: http://localhost:${PORT}/api/sun để xem kết quả mới nhất`);

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