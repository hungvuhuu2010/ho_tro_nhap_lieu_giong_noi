// --- BIẾN TOÀN CỤC ---
let fileHandle = null; // Lưu tham chiếu File System Access API
let currentWorkbook = null;
let excelData = []; // Mảng chứa dữ liệu các dòng
let tableHeaders = ["Họ và tên", "Ngày sinh", "Giới tính"]; // Mặc định ban đầu

// Cấu hình định dạng cho từng trường
let fieldConfigs = {
    "Họ và tên": { type: "text", format: "capitalize_words" },
    "Ngày sinh": { type: "date", format: "date_normalize" },
    "Giới tính": { type: "text", format: "capitalize_words" }
};

// Cấu hình IndexedDB để lưu trữ fileHandle vĩnh viễn (tránh hỏi allow nhiều lần)
const DB_NAME = "ExcelVoiceAppDB";
const STORE_NAME = "fileStore";


let customDictionary = {}; // Lưu trữ từ điển thay thế

// Tự động tải file từ điển khi ứng dụng khởi động
async function loadDictionary() {
    try {
        const response = await fetch('dictionary.txt');
        if (response.ok) {
            const textContent = await response.text();
            parseDictionaryText(textContent);
            console.log("Đã nạp thành công từ điển .txt:", customDictionary);
        }
    } catch (err) {
        console.warn("Không tìm thấy tệp dictionary.txt, sử dụng từ điển mặc định.");
        customDictionary = {
            "a còng": "@",
            "gạch dưới": "_",
            "chấm": ".",
            "phẩy": ",",
            "chấm phẩy": ";"
        };
    }
}

// Gọi hàm nạp từ điển ngay trong sự kiện DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    await loadDictionary();
    // ... các đoạn code khởi tạo cũ khác (renderConfigTable, renderDynamicForm, v.v.)
});


// --- HÀM TRA CỨU VÀ THAY THẾ DỰA TRÊN TỪ ĐIỂN ---
// Hàm phân tích nội dung tệp txt 2 cột (hỗ trợ phân tách bằng dấu '|', tab hoặc dấu ':')
function parseDictionaryText(text) {
    customDictionary = {};
    const lines = text.split('\n');
    
    lines.forEach(line => {
        // Loại bỏ khoảng trắng thừa ở đầu/cuối dòng
        let cleanLine = line.trim();
        
        // Bỏ qua các dòng trống hoặc dòng chú thích bắt đầu bằng dấu #
        if (!cleanLine || cleanLine.startsWith('#')) return;

        // Tách 2 cột dựa vào ký tự phân cách ('|', tab '\t', hoặc ':')
        let parts = [];
        if (cleanLine.includes('|')) {
            parts = cleanLine.split('|');
        } else if (cleanLine.includes('\t')) {
            parts = cleanLine.split('\t');
        } else if (cleanLine.includes(':')) {
            parts = cleanLine.split(':');
        }

        if (parts.length >= 2) {
            let key = parts[0].trim().toLowerCase();
            let value = parts[1].trim();
            if (key) {
                customDictionary[key] = value;
            }
        }
    });
}

// Hàm tra cứu và thay thế dựa trên từ điển
function applyDictionary(text) {
    if (!text || typeof text !== 'string') return text;
    
    let processed = text.toLowerCase();

    // Sắp xếp các key theo độ dài giảm dần để ưu tiên khớp cụm từ dài trước
    const sortedKeys = Object.keys(customDictionary).sort((a, b) => b.length - a.length);

    sortedKeys.forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'gi');
        processed = processed.replace(regex, customDictionary[key]);
    });

    return processed;
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

async function saveHandleToDB(handle) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(handle, "savedFileHandle");
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function getHandleFromDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get("savedFileHandle");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- CHUYỂN TAB ---
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Đồng bộ nút tab đang active dựa vào tabId
    if (tabId === 'inputTab') {
		const btn = document.querySelector('.tab-btn[onclick*="inputTab"]');
		if (btn) btn.classList.add('active');
	} else if (tabId === 'configTab') {
		const btn = document.querySelector('.tab-btn[onclick*="configTab"]');
		if (btn) btn.classList.add('active');
	} else if (tabId === 'richVoiceTab') {
		const btn = document.querySelector('.tab-btn[onclick*="richVoiceTab"]');
		if (btn) btn.classList.add('active');
	}
};

// --- HIỂN THỊ THÔNG BÁO TOAST ---
window.showToast = function(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = isError ? '#dc2626' : '#111827';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};

// --- KHỞI TẠO GIAO DIỆN BAN ĐẦU VÀ KHÔI PHỤC QUYỀN ---
document.addEventListener('DOMContentLoaded', async () => {
    renderConfigTable();
    renderDynamicForm();
    renderDataTable();

    // Tự động khôi phục tệp từ lần làm việc trước mà không cần hỏi lại Allow nếu trình duyệt cấp phép
    try {
        const savedHandle = await getHandleFromDB();
        if (savedHandle) {
            const options = { mode: 'readwrite' };
            if ((await savedHandle.queryPermission(options)) === 'granted') {
                fileHandle = savedHandle;
                const file = await fileHandle.getFile();
                document.getElementById('selectedFileName').textContent = `Tệp đã ghi nhớ: ${file.name}`;
                document.getElementById('fileStatusBadge').textContent = 'Đã tự động kết nối lại';
                document.getElementById('fileStatusBadge').className = 'status-badge success';
                
                const data = await file.arrayBuffer();
                currentWorkbook = XLSX.read(data);
                parseWorkbookData();
                showToast('Đã tự động khôi phục tệp Excel từ phiên trước!');
            } else {
                document.getElementById('selectedFileName').textContent = 'Tệp đã lưu trước đó. Vui lòng bấm "Chọn tệp Excel" để cấp quyền lại.';
            }
        }
    } catch (err) {
        console.log("Không tìm thấy tệp lưu trước đó:", err);
    }
});

// --- SỰ KIỆN THÊM TRƯỜNG MỚI (ĐẢM BẢO GIỮ ĐÚNG THỨ TỰ THÊM) ---
document.getElementById('btnAddField').addEventListener('click', () => {
    const nameInput = document.getElementById('newFieldName');
    const typeSelect = document.getElementById('newFieldType');
    const fieldName = nameInput.value.trim();

    if (!fieldName) {
        showToast('Vui lòng nhập tên trường thông tin!', true);
        return;
    }
    
    // Kiểm tra xem trường đã tồn tại trong mảng tableHeaders chưa
    if (tableHeaders.includes(fieldName)) {
        showToast('Trường này đã tồn tại!', true);
        return;
    }

    // Đẩy trực tiếp vào cuối mảng tableHeaders để giữ nguyên thứ tự thêm vào
    tableHeaders.push(fieldName);
    
    // Gán cấu hình cho trường tương ứng
    fieldConfigs[fieldName] = {
        type: typeSelect.value,
        format: typeSelect.value === 'date' ? 'date_normalize' : (typeSelect.value === 'email' ? 'email_normalize' : 'capitalize_words')
    };

    nameInput.value = '';
    
    // Gọi lại các hàm vẽ giao diện để cập nhật ngay lập tức theo đúng thứ tự mảng tableHeaders
    renderConfigTable();
    renderDynamicForm();
    renderDataTable();
    
    showToast(`Đã thêm trường "${fieldName}" thành công!`);
});

function removeField(fieldName) {
    if (tableHeaders.length <= 1) {
        showToast('Cần ít nhất một trường thông tin!', true);
        return;
    }
    tableHeaders = tableHeaders.filter(h => h !== fieldName);
    delete fieldConfigs[fieldName];
    renderConfigTable();
    renderDynamicForm();
    renderDataTable();
    showToast(`Đã xóa trường "${fieldName}".`);
}

function renderConfigTable() {
    const tbody = document.getElementById('configFieldBody');
    tbody.innerHTML = '';
    tableHeaders.forEach((header, index) => {
        const config = fieldConfigs[header] || { type: 'text', format: 'none' };
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center">${index + 1}</td> 
            <td><strong>${header}</strong></td> 
            <td> 
                <select onchange="updateFieldType('${header}', this.value)"> 
                    <option value="text" ${config.type === 'text' ? 'selected' : ''}>Văn bản thường</option> 
                    <option value="date" ${config.type === 'date' ? 'selected' : ''}>Ngày tháng</option> 
                    <option value="number" ${config.type === 'number' ? 'selected' : ''}>Số</option> 
                    <option value="email" ${config.type === 'email' ? 'selected' : ''}>Email</option> 
                </select> 
            </td> 
            <td class="text-center"> 
                <button class="btn-del-row" onclick="removeField('${header}')">×</button> 
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.updateFieldType = function(header, type) {
    if (fieldConfigs[header]) {
        fieldConfigs[header].type = type;
        if (type === 'date') fieldConfigs[header].format = 'date_normalize';
        else if (type === 'email') fieldConfigs[header].format = 'email_normalize';
    }
};


// --- SINH BIỂU MẪU NHẬP LIỆU ĐỘNG ---
function renderDynamicForm() {
    const container = document.getElementById('dynamicFormContainer');
    const btnAddRecord = document.getElementById('btnAddRecord');

    if (!fileHandle) {
        container.innerHTML = `
            <div class="info-box" style="background-color: #fef2f2; border-color: #fca5a5; color: #991b1b;">
                ⚠️ <strong>Chưa liên kết tệp Excel!</strong> Vui lòng chuyển sang thẻ 
                <a href="#" onclick="switchTab('configTab'); return false;" style="color: #2563eb; text-decoration: underline; font-weight: bold;">"Chọn tệp cơ sở dữ liệu hoặc tạo mẫu"</a> 
                để chọn tệp Excel trên ổ cứng hoặc tạo tệp mẫu trước khi bắt đầu nhập liệu.
            </div>
        `;
        if (btnAddRecord) btnAddRecord.disabled = true;
        return;
    }

    if (tableHeaders.length === 0) {
        container.innerHTML = `<div class="info-box">Chưa có trường thông tin nào được cấu hình trong tệp.</div>`;
        if (btnAddRecord) btnAddRecord.disabled = true;
        return;
    }

    if (btnAddRecord) btnAddRecord.disabled = false;
    let html = '<div class="form-grid">';

    tableHeaders.forEach((header, index) => {
        const config = fieldConfigs[header] || { type: 'text', format: 'capitalize_words' };
        
        let formatOptionsHtml = '';
        if (config.type === 'text') {
            formatOptionsHtml = `
                <div style="display: flex; gap: 16px; margin-top: 8px; font-size: 13px; color: var(--text-light); align-items: center;">
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" id="fmt_cap_${index}" ${config.format === 'capitalize_words' ? 'checked' : ''} onchange="updateFormatFlag('${header}', 'capitalize_words', this.checked)"> Viết hoa đầu từ
                    </label>
                    <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" id="fmt_up_${index}" ${config.format === 'uppercase' ? 'checked' : ''} onchange="updateFormatFlag('${header}', 'uppercase', this.checked)"> Viết hoa toàn bộ
                    </label>
                </div>
            `;
        } else if (config.type === 'date') {
            formatOptionsHtml = `
                <div style="display: flex; gap: 12px; margin-top: 8px; font-size: 13px; color: var(--text-light);">
                    <span style="color: var(--primary);">📅 Tự động chuẩn hóa định dạng ngày (DD/MM/YYYY)</span>
                </div>
            `;
        } else if (config.type === 'email') {
            formatOptionsHtml = `
                <div style="display: flex; gap: 12px; margin-top: 8px; font-size: 13px; color: var(--text-light);">
                    <span style="color: var(--primary);">✉️ Tự động chuyển không dấu, viết liền, hỗ trợ đọc "a còng", "gạch dưới"</span>
                </div>
            `;
        }

        html += `
            <div class="form-group ${tableHeaders.length % 2 !== 0 && index === tableHeaders.length - 1 ? 'full-width' : ''}">
                <label>${header}</label>
                <div style="display: flex; gap: 8px; width: 100%; align-items: flex-start;">
                    <textarea id="input_field_${index}" 
                              placeholder="Nhập hoặc đọc giọng nói..." 
                              style="flex: 1;" 
                              rows="1" 
                              oninput="autoResizeTextarea(this)"></textarea>
                    <button type="button" class="button secondary" onclick="startSpeechToText(${index})" title="Đọc giọng nói tiếng Việt" style="margin-top: 0;">🎙️ Nói</button>
                </div>
                ${formatOptionsHtml}
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// --- HÀM TỰ ĐỘNG MỞ RỘNG CHIỀU CAO TEXTAREA THEO NỘI DUNG ---
window.autoResizeTextarea = function(element) {
    element.style.height = 'auto'; // Reset chiều cao để tính toán lại
    element.style.height = (element.scrollHeight) + 'px'; // Đặt chiều cao bằng đúng nội dung bên trong
};

window.updateFormatFlag = function(header, formatType, isChecked) {
    if (!fieldConfigs[header]) return;
    if (isChecked) {
        fieldConfigs[header].format = formatType;
    } else {
        fieldConfigs[header].format = 'none';
    }
};

// --- TÍCH HỢP SPEECH-TO-TEXT TỐC ĐỘ CAO (TỰ ĐỘNG GIẢI PHÓNG LUỒNG) ---
window.startSpeechToText = function(index) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Web Speech API).', true);
        return;
    }

    const inputElem = document.getElementById(`input_field_${index}`);
    const buttonElem = event.target; 
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false; // Chỉ lấy kết quả cuối cùng để chốt nhanh
    recognition.maxAlternatives = 1;

    showToast('🎙️ Đang nghe... Hãy nói.');
    if (buttonElem) {
        buttonElem.textContent = '🔴 Đang nghe...';
        buttonElem.disabled = true;
    }
    if (inputElem) {
        inputElem.placeholder = 'Đang lắng nghe...';
    }

    recognition.onresult = function(event) {
        let speechResult = event.results[0][0].transcript.trim();
        
        // Xử lý từ điển và chuẩn hóa dữ liệu ngầm ngay lập tức
        let processedText = applyDictionary(speechResult);
        
        const header = tableHeaders[index];
        const config = fieldConfigs[header];

        if (config) {
            if (config.type === 'email') {
                processedText = processedText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/\s+/g, '');
            } else if (config.type === 'date') {
                let text = processedText.toLowerCase();
                let day = '', month = '', year = '';

                // Bắt cú pháp có từ "tháng" và "năm" (VD: "12 tháng 10 năm 1990" hoặc "3 tháng 9 năm 68")
                let matchThangNam = text.match(/(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})(?:\s*năm\s*(\d{2,4}))?/i);
                
                if (matchThangNam) {
                    day = matchThangNam[1].padStart(2, '0');
                    month = matchThangNam[2].padStart(2, '0');
                    let rawYear = matchThangNam[3];
                    
                    if (rawYear) {
                        // Nếu năm đọc dạng viết tắt 2 chữ số (VD: "68" -> 1968 hoặc 2068, mặc định nếu > 50 là 19xx, ngược lại 20xx)
                        if (rawYear.length === 2) {
                            year = (parseInt(rawYear, 10) > 50 ? '19' : '20') + rawYear;
                        } else {
                            year = rawYear;
                        }
                    } else {
                        // Nếu không đọc năm, lấy năm hiện tại hoặc để trống tùy bạn (ở đây tạm lấy năm hiện tại 2026)
                        year = new Date().getFullYear().toString();
                    }
                    processedText = `${day}/${month}/${year}`;
                } else {
                    // Fallback: Nếu đọc thuần túy các con số (VD: 12051990 hoặc 12 05 1990)
                    let digits = text.replace(/\D/g, '');
                    if (digits.length >= 6) {
                        if (digits.length === 8) {
                            day = digits.substring(0, 2);
                            month = digits.substring(2, 4);
                            year = digits.substring(4, 8);
                        } else if (digits.length === 6) {
                            day = '0' + digits.substring(0, 1);
                            month = digits.substring(1, 3);
                            year = digits.substring(3, 7);
                        } else {
                            processedText = ''; // Không đúng chuẩn cấu trúc số ngày tháng -> Trả về rỗng
                        }
                        
                        if (day && month && year) {
                            processedText = `${day}/${month}/${year}`;
                        } else {
                            processedText = '';
                        }
                    } else {
                        // 🛑 Nếu không bắt được cấu trúc ngày tháng hợp lệ nào -> Trả về rỗng thay vì ghi lung tung
                        processedText = '';
                    }
                }
            } else {
                processedText = processedText.trim().replace(/[\.,;]+$/, '');
                if (config.format === 'capitalize_words') {
                    processedText = processedText.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
                } else if (config.format === 'uppercase') {
                    processedText = processedText.toUpperCase();
                }
            }
        }

        if (inputElem) {
            inputElem.value = processedText;
            inputElem.placeholder = 'Nhập hoặc đọc giọng nói...';
            autoResizeTextarea(inputElem);
        }
        
        // Giải phóng nút ngay khi có kết quả để sang ô khác
        if (buttonElem) {
            buttonElem.textContent = '🎙️ Nói';
            buttonElem.disabled = false;
        }
    };

    recognition.onerror = function(event) {
        if (inputElem) inputElem.placeholder = 'Nhập hoặc đọc giọng nói...';
        if (buttonElem) {
            buttonElem.textContent = '🎙️ Nói';
            buttonElem.disabled = false;
        }
        if (event.error === 'aborted') return;
        showToast('Lỗi nhận diện: ' + event.error, true);
    };

    recognition.onend = function() {
        if (buttonElem && buttonElem.disabled) {
            buttonElem.textContent = '🎙️ Nói';
            buttonElem.disabled = false;
        }
        if (inputElem) {
            inputElem.placeholder = 'Nhập hoặc đọc giọng nói...';
        }
    };

    recognition.start();
};
// --- MỞ TỆP EXCEL VÀ LƯU VÀO INDEXEDDB ---
document.getElementById('btnOpenFile').addEventListener('click', async () => {
    try {
        if (!window.showOpenFilePicker) {
            showToast('Trình duyệt không hỗ trợ File System Access API.', true);
            return;
        }
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Excel Files',
                accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }],
            multiple: false
        });
        fileHandle = handle;
        
        // Lưu vào IndexedDB để lần sau mở tự động
        await saveHandleToDB(fileHandle);

        const file = await fileHandle.getFile();
        document.getElementById('selectedFileName').textContent = `Tệp đã chọn: ${file.name}`;
        document.getElementById('fileStatusBadge').textContent = 'Đã kết nối tệp';
        document.getElementById('fileStatusBadge').className = 'status-badge success';

        const data = await file.arrayBuffer();
        currentWorkbook = XLSX.read(data);
        parseWorkbookData();
        showToast('Đã lưu quyền và nạp dữ liệu thành công!');
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            showToast('Không thể mở tệp: ' + err.message, true);
        }
    }
});

function parseWorkbookData() {
    if (!currentWorkbook) return;
    const firstSheetName = currentWorkbook.SheetNames[0];
    const worksheet = currentWorkbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (jsonData.length > 0) {
        tableHeaders = jsonData[0].map(String);
        excelData = jsonData.slice(1).map(row => {
            let obj = {};
            tableHeaders.forEach((h, idx) => {
                obj[h] = row[idx] !== undefined ? row[idx] : '';
            });
            return obj;
        });
        
        tableHeaders.forEach(h => {
            if (!fieldConfigs[h]) fieldConfigs[h] = { type: 'text', format: 'capitalize_words' };
        });

        renderConfigTable();
        renderDynamicForm();
        renderDataTable();
    }
}

// --- THÊM BẢN GHI VÀ GHI ĐÈ TRỰC TIẾP VÀO FILE ---
document.getElementById('btnAddRecord').addEventListener('click', async () => {
    let newRecord = {};
    tableHeaders.forEach((header, index) => {
        const inputElem = document.getElementById(`input_field_${index}`);
        let val = inputElem ? inputElem.value.trim() : '';
        const config = fieldConfigs[header];
        if (config) {
            if (config.format === 'capitalize_words') {
                val = val.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
            } else if (config.format === 'uppercase') {
                val = val.toUpperCase();
            }
        }
        newRecord[header] = val;
    });

    excelData.push(newRecord);
    renderDataTable();

    tableHeaders.forEach((_, index) => {
        const inputElem = document.getElementById(`input_field_${index}`);
        if (inputElem) inputElem.value = '';
    });

    await saveWorkbookToFile();
    showToast('Đã thêm bản ghi và cập nhật tệp Excel thành công!');
});

async function saveWorkbookToFile() {
    let rows = [tableHeaders];
    excelData.forEach(item => {
        let row = tableHeaders.map(h => item[h] !== undefined ? item[h] : '');
        rows.push(row);
    });

    const newWs = XLSX.utils.aoa_to_sheet(rows);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "DuLieuNhapLieu");
    currentWorkbook = newWb;

    if (fileHandle && window.showOpenFilePicker) {
        try {
            const writable = await fileHandle.createWritable();
            const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
            await writable.write(wbout);
            await writable.close();
        } catch (err) {
            console.error("Lỗi khi ghi đè tệp:", err);
            downloadFallback(newWb);
        }
    } else {
        downloadFallback(newWb);
    }
}

function downloadFallback(wb) {
    XLSX.writeFile(wb, "DuLieuNhapLieu_Voice.xlsx");
    showToast('Đã tải xuống tệp Excel cập nhật.');
}

// --- HIỂN THỊ BẢNG DỮ LIỆU ---
function renderDataTable() {
    const headerRow = document.getElementById('tableHeaderRow');
    const bodyRows = document.getElementById('tableBodyRows');
    
    // Đảm bảo wrapper của bảng có CSS giới hạn chiều cao 500px và cuộn dọc
    const wrapper = document.querySelector('.question-matrix-wrapper');
    if (wrapper) {
        wrapper.style.maxHeight = '500px';
        wrapper.style.overflowY = 'auto';
        wrapper.style.position = 'relative';
    }

    if (tableHeaders.length === 0) {
        headerRow.innerHTML = '<th>STT</th><th>Chưa có cấu hình</th>';
        bodyRows.innerHTML = '<tr><td colspan="2" class="text-center">Vui lòng thêm trường thông tin.</td></tr>';
        return;
    }

    let hHtml = '<th>STT</th>';
    tableHeaders.forEach(h => {
        hHtml += `<th>${h}</th>`;
    });
    headerRow.innerHTML = hHtml;

    if (excelData.length === 0) {
        bodyRows.innerHTML = `<tr><td colspan="${tableHeaders.length + 1}" class="text-center">Chưa có bản ghi nào trong phiên làm việc này.</td></tr>`;
        return;
    }

    let bHtml = '';
    // Tạo bản sao đảo ngược mảng để hiển thị bản ghi mới nhất lên đầu, 
    // nhưng STT vẫn tính theo thứ tự thật từ 1 đến N của mảng gốc
    const reversedData = [...excelData].reverse();
    
    reversedData.forEach((row, revIdx) => {
        // Tính lại STT thật tương ứng với vị trí trong mảng gốc excelData
        const originalIndex = excelData.length - 1 - revIdx;
        
        bHtml += `<tr>`;
        bHtml += `<td class="text-center">${originalIndex + 1}</td>`;
        tableHeaders.forEach(h => {
            bHtml += `<td>${row[h] !== undefined ? row[h] : ''}</td>`;
        });
        bHtml += `</tr>`;
    });
    bodyRows.innerHTML = bHtml;
}

// --- XỬ LÝ TOÀN MÀN HÌNH (FULL SCREEN) ---
window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            showToast('Trình duyệt không hỗ trợ chế độ toàn màn hình!', true);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
};

// Tự động đổi biểu tượng/chữ của nút khi thay đổi trạng thái toàn màn hình
document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btnFullScreen');
    if (!btn) return;
    if (document.fullscreenElement) {
        btn.textContent = '⛶';
    } else {
        btn.textContent = '⛶';
    }
});

// --- TẠO TỆP MẪU TRỐNG DỰA TRÊN BẢNG CẤU HÌNH ---
document.getElementById('btnCreateNewTemplate').addEventListener('click', () => {
    // Thu thập trực tiếp danh sách tên trường từ mảng tableHeaders (đại diện cho cấu hình hiện tại)
    // Hoặc quét trực tiếp từ giao diện bảng configFieldTable nếu muốn chắc chắn
    let headersToExport = [...tableHeaders];
    
    if (headersToExport.length === 0) {
        showToast('Chưa có trường thông tin nào được cấu hình!', true);
        return;
    }

    let rows = [headersToExport];
    const newWs = XLSX.utils.aoa_to_sheet(rows);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "DuLieuNhapLieu");
    XLSX.writeFile(newWb, "MauNhapLieuMoi.xlsx");
    showToast('Đã tạo và tải xuống tệp mẫu Excel từ các trường cấu hình!');
});

// --- XỬ LÝ SOẠN THẢO RICH TEXT & NHẬP LIỆU GIỌNG NÓI ---

// 1. Nhận diện giọng nói và nạp nối tiếp vào Rich Editor
window.startRichSpeechToText = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Web Speech API).', true);
        return;
    }

    const editor = document.getElementById('richEditor');
    const btn = document.getElementById('btnRichVoice');

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN'; // Ngôn ngữ Tiếng Việt
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    showToast('🎙️ Đang nghe... Hãy nói.');
    if (btn) {
        btn.textContent = '🔴 Đang nghe...';
        btn.disabled = true;
    }

    recognition.onresult = function(event) {
        // SỬA TẠI ĐÂY: Truy cập cấp [0][0] để lấy chuỗi văn bản
        let speechResult = event.results[0][0].transcript.trim();
        
        // Áp dụng từ điển chuẩn hóa nếu có
        if (typeof applyDictionary === 'function') {
            speechResult = applyDictionary(speechResult);
        }

        if (editor) {
            editor.focus();
            
            // Tự động thêm khoảng trắng trước câu mới nếu editor đã có văn bản
            const currentContent = editor.innerText.trim();
            const textToInsert = (currentContent.length > 0 ? ' ' : '') + speechResult;
            
            // Chèn văn bản tại vị trí con trỏ hiện tại
            document.execCommand('insertText', false, textToInsert);
        }
    };


    recognition.onerror = function(event) {
        if (btn) {
            btn.textContent = '🎙️ Nói';
            btn.disabled = false;
        }
        if (event.error === 'aborted') return;
        showToast('Lỗi nhận diện: ' + event.error, true);
    };

    recognition.onend = function() {
        if (btn) {
            btn.textContent = '🎙️ Nói';
            btn.disabled = false;
        }
    };

    recognition.start();
};

// 2. Các hàm định dạng văn bản (Đậm, Nghiêng, Gạch chân, Màu chữ)
window.formatText = function(command) {
    document.getElementById('richEditor').focus();
    document.execCommand(command, false, null);
};

window.changeTextColor = function(colorHex) {
    document.getElementById('richEditor').focus();
    document.execCommand('foreColor', false, colorHex);
};

// 3. Sao chép văn bản định dạng (dán vào Word, Google Docs giữ nguyên style)
window.copyFormattedText = async function() {
    const editor = document.getElementById('richEditor');
    if (!editor || !editor.innerText.trim()) {
        showToast('Chưa có nội dung để sao chép!', true);
        return;
    }

    const htmlContent = editor.innerHTML;
    const textContent = editor.innerText;

    try {
        if (navigator.clipboard && window.ClipboardItem) {
            const blobHtml = new Blob([htmlContent], { type: 'text/html' });
            const blobText = new Blob([textContent], { type: 'text/plain' });
            const data = [new ClipboardItem({
                'text/html': blobHtml,
                'text/plain': blobText
            })];
            await navigator.clipboard.write(data);
            showToast('📋 Đã sao chép văn bản định dạng! Có thể dán trực tiếp vào Word hoặc Google Docs.');
        } else {
            // Phương án dự phòng (fallback) cho trình duyệt cũ
            const range = document.createRange();
            range.selectNodeContents(editor);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
            showToast('📋 Đã sao chép văn bản!');
        }
    } catch (err) {
        console.error('Lỗi sao chép:', err);
        showToast('Không thể sao chép định dạng: ' + err.message, true);
    }
};

// 4. Xóa nội dung khung soạn thảo
window.clearRichEditor = function() {
    const editor = document.getElementById('richEditor');
    if (editor && editor.innerText.trim() && confirm('Bạn có chắc chắn muốn xóa toàn bộ nội dung?')) {
        editor.innerHTML = '';
        showToast('Đã xóa nội dung.');
    }
};


// --- CẢNH BÁO KHI ĐÓNG TAB ---
window.addEventListener('beforeunload', (e) => {
    if (excelData.length > 0) {
        e.preventDefault();
        e.returnValue = 'Bạn có dữ liệu chưa được lưu hoặc đang làm việc. Bạn có chắc muốn rời đi?';
        return e.returnValue;
    }
});

