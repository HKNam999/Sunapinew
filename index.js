const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const PORT = 5000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Danh sách các client đang kết nối tới Replit server
const localClients = new Set();

wss.on('connection', (ws) => {
    localClients.add(ws);
    console.log('📱 Client mới kết nối vào WebSocket local');
    
    // Gửi dữ liệu hiện tại ngay khi client kết nối
    if (latestHistoryData.htr.length > 0) {
        ws.send(JSON.stringify({ type: 'history', data: formatDiceData(latestHistoryData.htr) }));
    }

    ws.on('close', () => {
        localClients.delete(ws);
        console.log('📱 Client đã ngắt kết nối WebSocket local');
    });
});

// Hàm broadcast dữ liệu tới tất cả client local
function broadcast(data) {
    const message = JSON.stringify(data);
    localClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

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

// Thuật toán Tài Xỉu - Đa Tầng Linh Hoạt
class ThuatToanTaiXiu {
    constructor() {
        this.tenThuatToan = "DA_TANG_LINH_HOAT_V1";
        this.lichSuDuDoan = [];
        this.trongSoThuatToan = {
            batBet: { trongSo: 1.5, hieuSuat: 0.5, soLanSuDung: 0 },
            beBet: { trongSo: 1.3, hieuSuat: 0.5, soLanSuDung: 0 },
            giongPhienTruoc: { trongSo: 1.0, hieuSuat: 0.5, soLanSuDung: 0 },
            xenKeMacDinh: { trongSo: 1.2, hieuSuat: 0.5, soLanSuDung: 0 }
        };
        this.cauHinhBeBet = {
            doNhayThap: 6,
            doNhayTrungBinh: 8, 
            doNhayCao: 10,
            doNhaySieuCao: 12
        };
    }

    duDoan(lichSu) {
        if (!lichSu || lichSu.length < 5) {
            return this.duDoanKhongDuLieu();
        }

        // PHÂN TÍCH ĐA TẦNG - KHÔNG MÂU THUẪN
        const phanTich = {
            nhanDienCau: this.AI_TranBinh_NhanDien(lichSu), // CHỈ NHẬN DIỆN, KHÔNG ĐOÁN
            bet: this.AI_BatBet(lichSu),
            coSo: this.duDoanCoSo(lichSu)
        };

        // TẠO CÁC PHƯƠNG ÁN DỰ ĐOÁN LINH HOẠT
        const cacPhuongAn = this.taoPhuongAnLinhHoat(phanTich, lichSu);
        
        // CHỌN PHƯƠNG ÁN TỐI ƯU VỚI CHIẾN LƯỢC RÕ RÀNG
        const ketQua = this.chonPhuongAnToiUu(cacPhuongAn, phanTich, lichSu);
        
        // CẬP NHẬT THỐNG KÊ
        this.capNhatTrongSo(ketQua.loaiThuatToan);

        return ketQua;
    }

    AI_TranBinh_NhanDien(lichSu) {
        const lichSuGan = lichSu.slice(0, 8);
        const ketQua = lichSuGan.map(p => p.ket_qua);
        const diemSo = lichSuGan.map(p => p.tong);

        const nhanDien = {
            loaiCau: "chua_ro",
            doOndinh: this.tinhDoOndinh(ketQua),
            doManhCuaBet: 0,
            patternPhatHien: []
        };

        // NHẬN DIỆN PATTERN (CHỈ ĐỂ PHÂN TÍCH, KHÔNG ĐOÁN)
        if (this.kiemTraPattern1_1(ketQua)) {
            nhanDien.patternPhatHien.push("1_1");
            nhanDien.loaiCau = "xen_ke_1_1";
        }
        if (this.kiemTraPattern2_2(ketQua)) {
            nhanDien.patternPhatHien.push("2_2");
            nhanDien.loaiCau = "xen_ke_2_2";
        }
        if (this.kiemTraPattern1_2_1(ketQua)) {
            nhanDien.patternPhatHien.push("1_2_1");
            nhanDien.loaiCau = "xen_ke_1_2_1";
        }
        if (this.kiemTraPattern2_1_2(ketQua)) {
            nhanDien.patternPhatHien.push("2_1_2");
            nhanDien.loaiCau = "xen_ke_2_1_2";
        }

        // NHẬN DIỆN BỆT
        const betAnalysis = this.AI_BatBet(lichSu);
        if (betAnalysis.coBet) {
            nhanDien.doManhCuaBet = betAnalysis.doManh;
            nhanDien.loaiCau = `bet_${betAnalysis.huong.toLowerCase()}`;
        }

        // NHẬN DIỆN XU HƯỚNG ĐIỂM
        nhanDien.xuHuongDiem = this.nhanDienXuHuongDiem(diemSo);

        // THÊM: Phân tích xu hướng ngắn hạn
        nhanDien.xuHuongNganHan = this.phanTichXuHuongNganHan(lichSu.slice(0, 5));
        
        return nhanDien;
    }

    AI_BatBet(lichSu) {
        const lichSuGan = lichSu.slice(0, 15);
        let doDai = 1;
        let ketQuaDau = lichSuGan[0].ket_qua;
        
        for (let i = 1; i < lichSuGan.length; i++) {
            if (lichSuGan[i].ket_qua === ketQuaDau) {
                doDai++;
            } else {
                break;
            }
        }

        if (doDai >= 2) {
            const diemTrungBinh = this.tinhDiemTrungBinhBet(lichSuGan, doDai);
            const doManh = this.tinhDoManhBet(doDai, diemTrungBinh, ketQuaDau);
            
            return {
                coBet: true,
                huong: ketQuaDau,
                doDai: doDai,
                doManh: doManh,
                diemTrungBinh: diemTrungBinh
            };
        }

        return { coBet: false };
    }

    taoPhuongAnLinhHoat(phanTich, lichSu) {
        const cacPhuongAn = [];
        const { nhanDienCau, bet, coSo } = phanTich;

        // 1. PHƯƠNG ÁN BẮT BỆT - ƯU TIÊN CAO
        if (bet.coBet) {
            const diemBatBet = this.tinhDiemBatBet(bet);
            cacPhuongAn.push({
                duDoan: bet.huong,
                diem: diemBatBet,
                loai: 'batBet',
                pattern: `bat_bet_${bet.doDai}`,
                doTinCay: bet.doManh,
                liDo: `Bắt xu hướng ngắn: Xu hướng ${bet.huong} mạnh (${bet.doDai}/5)`
            });

            // 2. PHƯƠNG ÁN BẺ BỆT - LINH HOẠT THEO NHẬN DIỆN CẦU
            if (this.AI_BeBet_LinhHoat(bet, nhanDienCau)) {
                const diemBeBet = this.tinhDiemBeBet(bet, nhanDienCau);
                cacPhuongAn.push({
                    duDoan: bet.huong === "Tài" ? "Xỉu" : "Tài",
                    diem: diemBeBet,
                    loai: 'beBet',
                    pattern: `be_bet_${bet.doDai}`,
                    doTinCay: 0.7,
                    liDo: `Bẻ xu hướng ngắn: Bẻ xu hướng ${bet.huong} sau ${bet.doDai}/4 phiên`
                });
            }
        }

        // 3. PHƯƠNG ÁN THEO LOẠI CẦU ĐÃ NHẬN DIỆN
        const phuongAnTheoCau = this.taoPhuongAnTheoLoaiCau(nhanDienCau, lichSu);
        if (phuongAnTheoCau) {
            cacPhuongAn.push(phuongAnTheoCau);
        }

        // 4. PHƯƠNG ÁN CƠ SỞ - LUÔN CÓ
        cacPhuongAn.push({
            duDoan: coSo.duDoan,
            diem: this.tinhDiemCoSo(coSo),
            loai: 'giongPhienTruoc',
            pattern: 'giong_phien_truoc',
            doTinCay: 0.6,
            liDo: 'Theo phiên trước'
        });

        return cacPhuongAn;
    }

    chonPhuongAnToiUu(cacPhuongAn, phanTich, lichSu) {
        // Sắp xếp theo điểm
        cacPhuongAn.sort((a, b) => b.diem - a.diem);
        const phuongAnTotNhat = cacPhuongAn[0];
        
        // Lấy thông tin phiên gần nhất
        const phienGanNhat = lichSu[0];
        
        // Xác định chiến lược đặt cược dựa trên độ tin cậy
        let chienLuoc = "";
        if (phuongAnTotNhat.doTinCay >= 0.8) {
            chienLuoc = "Mạnh - Đặt cược lớn";
        } else if (phuongAnTotNhat.doTinCay >= 0.6) {
            chienLuoc = "Trung bình - Đặt cược vừa";
        } else {
            chienLuoc = "Yếu - Đặt cược nhỏ";
        }
        
        return {
            Phien: phienGanNhat.phien + 1, // Dự đoán cho phiên tiếp theo
            Xuc_xac1: 0,
            Xuc_xac2: 0,
            Xuc_xac3: 0,
            Tong: 0,
            Ket_qua: "Chưa có",
            Du_doan: phuongAnTotNhat.duDoan,
            Li_do: phuongAnTotNhat.liDo || "Không có lý do cụ thể",
            Do_tin_cay: `${(phuongAnTotNhat.doTinCay * 100).toFixed(1)}%`,
            Chien_luoc: chienLuoc,
            pattern: phuongAnTotNhat.pattern,
            loaiThuatToan: phuongAnTotNhat.loai
        };
    }

    // CÁC PHƯƠNG THỨC HỖ TRỢ
    phanTichXuHuongNganHan(lichSuGan) {
        if (lichSuGan.length < 5) return {};
        
        const ketQua = lichSuGan.slice(0, 5).map(p => p.ket_qua);
        let taiCount = 0;
        let xiuCount = 0;
        
        ketQua.forEach(kq => {
            if (kq === "Tài") taiCount++;
            else xiuCount++;
        });
        
        return {
            huong: taiCount > xiuCount ? "Tài" : "Xỉu",
            doManh: Math.max(taiCount, xiuCount) / 5,
            taiCount,
            xiuCount
        };
    }

    AI_BeBet_LinhHoat(betAnalysis, nhanDienCau) {
        const { doDai, doManh, huong, diemTrungBinh } = betAnalysis;
        
        let nguongBeBet = this.cauHinhBeBet.doNhayTrungBinh;

        if (doManh < 0.6) nguongBeBet = this.cauHinhBeBet.doNhayThap;
        else if (doManh > 0.8) nguongBeBet = this.cauHinhBeBet.doNhayCao;
        else if (doManh > 0.9) nguongBeBet = this.cauHinhBeBet.doNhaySieuCao;

        if (nhanDienCau.loaiCau.includes('xen_ke')) {
            nguongBeBet -= 1;
        }

        if (nhanDienCau.xuHuongDiem === 'dang_giam' && huong === "Tài") return true;
        if (nhanDienCau.xuHuongDiem === 'dang_tang' && huong === "Xỉu") return true;

        return doDai >= nguongBeBet;
    }

    taoPhuongAnTheoLoaiCau(nhanDienCau, lichSu) {
        const ketQuaGanNhat = lichSu[0].ket_qua;

        switch(nhanDienCau.loaiCau) {
            case 'xen_ke_1_1':
                return {
                    duDoan: ketQuaGanNhat === "Tài" ? "Xỉu" : "Tài",
                    diem: 75,
                    loai: 'xenKeMacDinh',
                    pattern: 'xen_ke_1_1',
                    doTinCay: 0.8,
                    liDo: 'Pattern xen kẽ 1-1'
                };
                
            case 'xen_ke_2_2':
                return {
                    duDoan: ketQuaGanNhat === "Tài" ? "Xỉu" : "Tài",
                    diem: 70,
                    loai: 'xenKeMacDinh',
                    pattern: 'xen_ke_2_2',
                    doTinCay: 0.75,
                    liDo: 'Pattern xen kẽ 2-2'
                };

            case 'xen_ke_1_2_1':
                return {
                    duDoan: "Tài",
                    diem: 65,
                    loai: 'xenKeMacDinh',
                    pattern: 'xen_ke_1_2_1',
                    doTinCay: 0.7,
                    liDo: 'Pattern xen kẽ 1-2-1'
                };

            case 'xen_ke_2_1_2':
                return {
                    duDoan: "Xỉu",
                    diem: 65,
                    loai: 'xenKeMacDinh',
                    pattern: 'xen_ke_2_1_2',
                    doTinCay: 0.7,
                    liDo: 'Pattern xen kẽ 2-1-2'
                };

            default:
                return null;
        }
    }

    tinhDoOndinh(ketQua) {
        if (ketQua.length < 3) return 0.5;
        let thayDoi = 0;
        for (let i = 1; i < ketQua.length; i++) {
            if (ketQua[i] !== ketQua[i-1]) thayDoi++;
        }
        const tyLeThayDoi = thayDoi / (ketQua.length - 1);
        return 1 - Math.abs(tyLeThayDoi - 0.5);
    }

    nhanDienXuHuongDiem(diemSo) {
        if (diemSo.length < 3) return 'khong_ro';
        let tang = 0, giam = 0;
        for (let i = 0; i < diemSo.length - 1; i++) {
            if (diemSo[i] < diemSo[i + 1]) tang++;
            else if (diemSo[i] > diemSo[i + 1]) giam++;
        }
        if (tang >= diemSo.length - 2) return 'dang_tang';
        if (giam >= diemSo.length - 2) return 'dang_giam';
        return 'on_dinh';
    }

    kiemTraPattern1_1(ketQua) {
        if (ketQua.length < 4) return false;
        for (let i = 0; i < ketQua.length - 1; i++) {
            if (ketQua[i] === ketQua[i + 1]) return false;
        }
        return true;
    }

    kiemTraPattern2_2(ketQua) {
        if (ketQua.length < 4) return false;
        for (let i = 0; i < ketQua.length - 2; i += 2) {
            if (i + 1 < ketQua.length && ketQua[i] !== ketQua[i + 1]) return false;
            if (i + 3 < ketQua.length && ketQua[i + 2] !== ketQua[i + 3]) return false;
        }
        return true;
    }

    kiemTraPattern1_2_1(ketQua) {
        if (ketQua.length < 4) return false;
        return ketQua[0] !== ketQua[1] && ketQua[1] === ketQua[2] && ketQua[2] !== ketQua[3];
    }

    kiemTraPattern2_1_2(ketQua) {
        if (ketQua.length < 5) return false;
        return ketQua[0] === ketQua[1] && ketQua[1] !== ketQua[2] && ketQua[2] !== ketQua[3] && ketQua[3] === ketQua[4];
    }

    tinhDiemBatBet(betAnalysis) {
        const baseScore = betAnalysis.doManh * 80;
        const trongSo = this.trongSoThuatToan.batBet.trongSo;
        return baseScore * trongSo;
    }

    tinhDiemBeBet(betAnalysis, nhanDienCau) {
        const baseScore = 70;
        const trongSo = this.trongSoThuatToan.beBet.trongSo;
        
        if (nhanDienCau.xuHuongDiem !== 'khong_ro') {
            return baseScore * trongSo * 1.1;
        }
        
        return baseScore * trongSo;
    }

    tinhDiemCoSo(coSoAnalysis) {
        const baseScore = 60;
        const trongSo = this.trongSoThuatToan.giongPhienTruoc.trongSo;
        return baseScore * trongSo;
    }

    duDoanCoSo(lichSu) {
        return {
            duDoan: lichSu[0].ket_qua,
            pattern: "giong_phien_truoc"
        };
    }

    capNhatTrongSo(loaiThuatToan) {
        if (this.trongSoThuatToan[loaiThuatToan]) {
            this.trongSoThuatToan[loaiThuatToan].soLanSuDung++;
            this.canBangTrongSo();
        }
    }

    canBangTrongSo() {
        const tongTrongSo = Object.values(this.trongSoThuatToan)
            .reduce((sum, tt) => sum + tt.trongSo, 0);
        const trungBinh = tongTrongSo / Object.keys(this.trongSoThuatToan).length;
        
        Object.keys(this.trongSoThuatToan).forEach(loai => {
            const tt = this.trongSoThuatToan[loai];
            if (tt.trongSo > trungBinh * 1.3) {
                tt.trongSo *= 0.95;
            } else if (tt.trongSo < trungBinh * 0.7) {
                tt.trongSo *= 1.05;
            }
        });
    }

    duDoanKhongDuLieu() {
        return {
            Phien: 0,
            Xuc_xac1: 0,
            Xuc_xac2: 0,
            Xuc_xac3: 0,
            Tong: 0,
            Ket_qua: "Chưa có",
            Du_doan: Math.random() > 0.5 ? "Tài" : "Xỉu",
            Li_do: "Không đủ dữ liệu để phân tích",
            Do_tin_cay: "10.0%",
            Chien_luoc: "Không khuyến nghị đặt cược"
        };
    }

    tinhDiemTrungBinhBet(lichSu, doDai) {
        const diemSo = lichSu.slice(0, doDai).map(p => p.tong);
        return diemSo.reduce((sum, d) => sum + d, 0) / doDai;
    }

    tinhDoManhBet(doDai, diemTrungBinh, huong) {
        let doManh = 0.5 + (doDai - 2) * 0.1;
        if (huong === "Tài" && diemTrungBinh > 13) doManh += 0.2;
        if (huong === "Xỉu" && diemTrungBinh < 8) doManh += 0.2;
        if (huong === "Tài" && diemTrungBinh < 11) doManh -= 0.1;
        if (huong === "Xỉu" && diemTrungBinh > 10) doManh -= 0.1;
        return Math.min(0.95, Math.max(0.3, doManh));
    }
}

// Khởi tạo thuật toán
const thuatToanTaiXiu = new ThuatToanTaiXiu();

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

// === API ROUTES ===
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

// API DỰ ĐOÁN MỚI
app.get('/api/predic', (req, res) => {
    try {
        const htrData = latestHistoryData.htr || [];
        
        // Lấy 100 phiên gần nhất
        const recentData = htrData.slice(-100);
        
        // Format dữ liệu cho thuật toán
        const formattedForPrediction = formatDiceData(recentData);
        
        // Lấy thông tin phiên gần nhất
        const latestItem = recentData[recentData.length - 1];
        let result = {};
        
        if (latestItem && formattedForPrediction.length >= 5) {
            // Dự đoán
            result = thuatToanTaiXiu.duDoan(formattedForPrediction);
            
            // Thêm thông tin phiên gần nhất
            const d1 = latestItem.d1 || 0;
            const d2 = latestItem.d2 || 0;
            const d3 = latestItem.d3 || 0;
            const sid = latestItem.sid || 0;
            const total = d1 + d2 + d3;
            
            result.Phien = sid; // Phiên gần nhất
            result.Xuc_xac1 = d1;
            result.Xuc_xac2 = d2;
            result.Xuc_xac3 = d3;
            result.Tong = total;
            result.Ket_qua = total >= 11 ? "Tài" : "Xỉu";
            
            // Thêm thông tin phiên tiếp theo (phiên dự đoán)
            result.Phien_du_doan = sid + 1;
        } else {
            result = {
                Phien: 0,
                Xuc_xac1: 0,
                Xuc_xac2: 0,
                Xuc_xac3: 0,
                Tong: 0,
                Ket_qua: "Chưa có",
                Du_doan: "Chưa có",
                Li_do: "Chưa đủ dữ liệu để dự đoán (cần ít nhất 5 phiên)",
                Do_tin_cay: "0.0%",
                Chien_luoc: "Chờ thêm dữ liệu"
            };
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            Phien: 0,
            Xuc_xac1: 0,
            Xuc_xac2: 0,
            Xuc_xac3: 0,
            Tong: 0,
            Ket_qua: "Lỗi",
            Du_doan: "Lỗi",
            Li_do: "Lỗi hệ thống: " + error.message,
            Do_tin_cay: "0.0%",
            Chien_luoc: "Lỗi"
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
        try {
            ws.send(JSON.stringify(message1005));
        } catch (e) {
            console.error('❌ Lỗi gửi lệnh 1005:', e.message);
        }
    }
}

// Hàm gửi Heartbeat/Ping (GIỮ KẾT NỐI SỐNG)
function sendHeartbeat(ws) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            // Gửi ping của WebSocket protocol
            ws.ping();
            
            // Gửi thêm một message nhỏ để server game không ngắt kết nối
            const heartbeatMsg = [
                6, "MiniGame", "lobbyPlugin", 
                { cmd: 10001 }
            ];
            ws.send(JSON.stringify(heartbeatMsg));
        } catch (e) {
            console.error('❌ Lỗi gửi Heartbeat:', e.message);
        }
    }
}

// Hàm kết nối WebSocket (ĐÃ TỐI ƯU LOGIC)
function connectWebSocket() {
    try {
        console.log('🔌 Đang kết nối WebSocket...');
        
        if (pingInterval) clearInterval(pingInterval);

        const ws = new WebSocket(WEBSOCKET_URL, {
            headers: WS_HEADERS,
            rejectUnauthorized: false
        });
        
        wsConnection = ws;
        
        ws.on('open', function open() {
            console.log('### ✅ Kết nối mở thành công ###');
            
            const authMsg = [
                1, "MiniGame", "GM_apivopnha", "WangLin",
                {
                    "info": "{\"ipAddress\":\"14.249.227.107\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiI5ODE5YW5zc3MiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMjMyODExNTEsImFmZklkIjoic3VuLndpbiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzYzMDMyOTI4NzcwLCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjE0LjI0OS4yMjcuMTA3IiwibXV0ZSI6ZmFsc2UsImF2YXRhciI6Imh0dHBzOi8vaW1hZ2VzLnN3aW5zaG9wLm5ldC9pbWFnZXMvYXZhdGFyL2F2YXRhcl8wNS5wbmciLCJwbGF0Zm9ybUlkIjo0LCJ1c2VySWQiOiI4ODM4NTMzZS1kZTQzLTRiOGQtOTUwMy02MjFmNDA1MDUzNGUiLCJyZWdUaW1lIjoxNzYxNjMyMzAwNTc2LCJwaG9uZSI6IiIsImRlcG9zaXQiOmZhbHNlLCJ1c2VybmFtZSI6IkdNX2FwaXZvcG5oYSJ9.guH6ztJSPXUL1cU8QdMz8O1Sdy_SbxjSM-CDzWPTr-0\",\"locale\":\"vi\",\"userId\":\"8838533e-de43-4b8d-9503-621f4050534e\",\"username\":\"GM_apivopnha\",\"timestamp\":1763032928770,\"refreshToken\":\"e576b43a64e84f789548bfc7c4c8d1e5.7d4244a361e345908af95ee2e8ab2895\"}",
                    "signature": "45EF4B318C883862C36E1B189A1DF5465EBB60CB602BA05FAD8FCBFCD6E0DA8CB3CE65333EDD79A2BB4ABFCE326ED5525C7D971D9DEDB5A17A72764287FFE6F62CBC2DF8A04CD8EFF8D0D5AE27046947ADE45E62E644111EFDE96A74FEC635A97861A425FF2B5732D74F41176703CA10CFEED67D0745FF15EAC1065E1C8BCBFA"
                }
            ];
            ws.send(JSON.stringify(authMsg));
            
            setTimeout(() => {
                sendCmd1005(ws);
                
                const message10001 = [
                    6, "MiniGame", "lobbyPlugin", 
                    { cmd: 10001 }
                ];
                ws.send(JSON.stringify(message10001));
            }, 1000);

            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    sendHeartbeat(ws);
                    sendCmd1005(ws); 
                }
            }, 3000);
        });
        
        ws.on('message', function message(data) {
            try {
                const strData = data.toString();
                if(strData.length < 5) return;

                const parsedData = JSON.parse(strData);
                
                if (Array.isArray(parsedData) && parsedData.length >= 2 && parsedData[0] === 5) {
                    const payload = parsedData[1];
                    const cmd = payload.cmd;

                    switch (cmd) {
                        case 1005:
                            if (payload.htr && Array.isArray(payload.htr)) {
                                latestHistoryData.htr = payload.htr;
                                const lastItem = payload.htr[payload.htr.length - 1];
                                
                                if (lastItem.sid >= currentSessionId) {
                                    currentSessionId = lastItem.sid + 1;
                                }
                                const formatted = formatDiceData(payload.htr);
                                console.log(`✅ [LỊCH SỬ] Đã cập nhật ${payload.htr.length} phiên. Mới nhất: #${lastItem.sid}`);
                                
                                // Broadcast dữ liệu lịch sử mới tới các client đang kết nối
                                broadcast({ type: 'history', data: formatted });
                            }
                            break;

                        case 1008:
                            if (payload.sid) {
                                if (payload.sid > currentSessionId) {
                                    console.log(`🔄 [PHIÊN MỚI] Đang chạy phiên: #${payload.sid}`);
                                    currentSessionId = payload.sid;
                                    
                                    // Gửi lệnh lấy lịch sử sớm hơn khi phát hiện phiên mới
                                    setTimeout(() => sendCmd1005(ws), 1000);

                                    // Thông báo phiên mới tới client local
                                    broadcast({ type: 'new_session', data: { sid: payload.sid } });
                                }
                            }
                            break;

                        default:
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
            console.log(`### 🔌 Kết nối đóng. Code: ${code}, Reason: ${reason || 'Không rõ'}. Reconnect ngay lập tức... ###`);
            wsConnection = null;
            // Kết nối lại ngay lập tức (0ms) thay vì chờ 1s
            connectWebSocket();
        });
        
    } catch (error) {
        console.error('❌ Lỗi kết nối WebSocket:', error.message);
        setTimeout(connectWebSocket, 5000);
    }
}

// Khởi động server
server.listen(PORT, () => {
    console.log(`🚀 Server đã khởi động trên port ${PORT}`);
    console.log(`📊 Truy cập: http://localhost:${PORT}/api/his`);
    console.log(`🌞 Truy cập: http://localhost:${PORT}/api/sun`);
    console.log(`🔮 Truy cập: http://localhost:${PORT}/api/predic`);
    console.log(`📡 WebSocket local: ws://localhost:${PORT}`);
    
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
