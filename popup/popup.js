// popup.js - WhatsApp Toplu Mesaj Gönderici Kontrol Paneli

// Tab yönetimi
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  setupEventListeners();
  updateDashboard();
});

// Tab değiştirme
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    
    // Tüm tabları gizle
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
    });
    
    // Seçili tabı göster
    document.getElementById(tabName).classList.add('active');
    btn.classList.add('active');
  });
});

// Event listeners
function setupEventListeners() {
  // Dashboard kontrolleri
  document.getElementById('startCampaign').addEventListener('click', startCampaign);
  document.getElementById('pauseCampaign').addEventListener('click', pauseCampaign);
  document.getElementById('stopCampaign').addEventListener('click', stopCampaign);
  
  // Kişi yönetimi
  document.getElementById('addContact').addEventListener('click', addContact);
  document.getElementById('importCSV').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
  });
  document.getElementById('csvFileInput').addEventListener('change', handleCSVImport);
  
  // Mesaj şablonları
  document.getElementById('addTemplate').addEventListener('click', showTemplateForm);
  document.getElementById('saveTemplate').addEventListener('click', saveTemplate);
  document.getElementById('cancelTemplate').addEventListener('click', hideTemplateForm);
  
  // Zamanlama
  document.getElementById('saveSchedule').addEventListener('click', saveSchedule);
  
  // Ayarlar
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('clearData').addEventListener('click', clearAllData);
  document.getElementById('resetSettings').addEventListener('click', resetSettings);
}

// Tüm verileri yükle
async function loadAllData() {
  const data = await chrome.storage.local.get(['contacts', 'templates', 'settings', 'schedule', 'stats']);
  
  if (data.contacts) {
    renderContacts(data.contacts);
  }
  
  if (data.templates) {
    renderTemplates(data.templates);
  }
  
  if (data.settings) {
    loadSettings(data.settings);
  }
  
  if (data.schedule) {
    loadSchedule(data.schedule);
  }
  
  if (data.stats) {
    updateStats(data.stats);
  }
}

// Dashboard güncelle
async function updateDashboard() {
  const data = await chrome.storage.local.get(['contacts', 'stats', 'campaignStatus']);
  
  const totalContacts = data.contacts ? data.contacts.length : 0;
  const stats = data.stats || { sentToday: 0, pending: 0, failed: 0 };
  
  document.getElementById('totalContacts').textContent = totalContacts;
  document.getElementById('sentToday').textContent = stats.sentToday || 0;
  document.getElementById('pending').textContent = stats.pending || 0;
  document.getElementById('failed').textContent = stats.failed || 0;
  
  // İlerleme barı
  if (stats.total > 0) {
    const progress = (stats.sent / stats.total) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('progressText').textContent = `${stats.sent} / ${stats.total} mesaj gönderildi`;
  }
  
  // Durum göstergesi
  if (data.campaignStatus === 'running') {
    document.getElementById('statusText').textContent = 'Çalışıyor';
    document.querySelector('.status-dot').style.background = '#4ade80';
  } else if (data.campaignStatus === 'paused') {
    document.getElementById('statusText').textContent = 'Duraklatıldı';
    document.querySelector('.status-dot').style.background = '#f59e0b';
  } else {
    document.getElementById('statusText').textContent = 'Hazır';
    document.querySelector('.status-dot').style.background = '#6b7280';
  }
}

// Kampanya başlat
async function startCampaign() {
  const data = await chrome.storage.local.get(['contacts', 'templates', 'settings', 'schedule']);
  
  if (!data.contacts || data.contacts.length === 0) {
    addLog('Hata: Kişi listesi boş!', 'error');
    alert('Lütfen önce kişi ekleyin!');
    return;
  }
  
  if (!data.templates || data.templates.length === 0) {
    addLog('Hata: Mesaj şablonu yok!', 'error');
    alert('Lütfen önce mesaj şablonu ekleyin!');
    return;
  }
  
  // Kampanyayı başlat
  await chrome.storage.local.set({ campaignStatus: 'running' });
  
  // Background script'e mesaj gönder
  chrome.runtime.sendMessage({ action: 'startCampaign' });
  
  // UI güncelle
  document.getElementById('startCampaign').disabled = true;
  document.getElementById('pauseCampaign').disabled = false;
  document.getElementById('stopCampaign').disabled = false;
  
  addLog('Kampanya başlatıldı!', 'success');
  updateDashboard();
}

// Kampanyayı duraklat
async function pauseCampaign() {
  await chrome.storage.local.set({ campaignStatus: 'paused' });
  chrome.runtime.sendMessage({ action: 'pauseCampaign' });
  
  document.getElementById('startCampaign').disabled = false;
  document.getElementById('pauseCampaign').disabled = true;
  
  addLog('Kampanya duraklatıldı', 'warning');
  updateDashboard();
}

// Kampanyayı durdur
async function stopCampaign() {
  if (confirm('Kampanyayı durdurmak istediğinizden emin misiniz?')) {
    await chrome.storage.local.set({ campaignStatus: 'stopped' });
    chrome.runtime.sendMessage({ action: 'stopCampaign' });
    
    document.getElementById('startCampaign').disabled = false;
    document.getElementById('pauseCampaign').disabled = true;
    document.getElementById('stopCampaign').disabled = true;
    
    addLog('Kampanya durduruldu', 'error');
    updateDashboard();
  }
}

// Kişi ekle
async function addContact() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const var1 = document.getElementById('contactVar1').value.trim();
  const var2 = document.getElementById('contactVar2').value.trim();
  
  if (!name || !phone) {
    alert('İsim ve telefon gerekli!');
    return;
  }
  
  const data = await chrome.storage.local.get(['contacts']);
  const contacts = data.contacts || [];
  
  contacts.push({ name, phone, var1, var2, id: Date.now() });
  
  await chrome.storage.local.set({ contacts });
  
  // Formu temizle
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactVar1').value = '';
  document.getElementById('contactVar2').value = '';
  
  renderContacts(contacts);
  updateDashboard();
  addLog(`Kişi eklendi: ${name}`, 'success');
}

// Kişileri render et
function renderContacts(contacts) {
  const list = document.getElementById('contactsList');
  list.innerHTML = '';
  
  contacts.forEach(contact => {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
      <div class="contact-info">
        <div class="contact-name">${contact.name}</div>
        <div class="contact-phone">${contact.phone}</div>
      </div>
      <div class="contact-actions">
        <button class="btn btn-danger" onclick="deleteContact(${contact.id})">🗑️</button>
      </div>
    `;
    list.appendChild(div);
  });
}

// Kişi sil
window.deleteContact = async function(id) {
  const data = await chrome.storage.local.get(['contacts']);
  const contacts = data.contacts.filter(c => c.id !== id);
  await chrome.storage.local.set({ contacts });
  renderContacts(contacts);
  updateDashboard();
  addLog('Kişi silindi', 'warning');
}

// CSV import
function handleCSVImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split('\n');
    const contacts = [];
    
    // İlk satırı atla (başlık)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const [name, phone, var1, var2] = line.split(',');
      if (name && phone) {
        contacts.push({ name: name.trim(), phone: phone.trim(), var1: var1?.trim() || '', var2: var2?.trim() || '', id: Date.now() + i });
      }
    }
    
    const data = await chrome.storage.local.get(['contacts']);
    const allContacts = [...(data.contacts || []), ...contacts];
    await chrome.storage.local.set({ contacts: allContacts });
    
    renderContacts(allContacts);
    updateDashboard();
    addLog(`${contacts.length} kişi içe aktarıldı`, 'success');
  };
  reader.readAsText(file);
}

// Şablon formu göster
function showTemplateForm() {
  document.getElementById('templateForm').style.display = 'block';
}

function hideTemplateForm() {
  document.getElementById('templateForm').style.display = 'none';
  document.getElementById('templateText').value = '';
}

// Şablon kaydet
async function saveTemplate() {
  const text = document.getElementById('templateText').value.trim();
  if (!text) {
    alert('Mesaj metni gerekli!');
    return;
  }
  
  const data = await chrome.storage.local.get(['templates']);
  const templates = data.templates || [];
  templates.push({ text, id: Date.now() });
  
  await chrome.storage.local.set({ templates });
  renderTemplates(templates);
  hideTemplateForm();
  addLog('Şablon kaydedildi', 'success');
}

// Şablonları render et
function renderTemplates(templates) {
  const list = document.getElementById('templatesList');
  list.innerHTML = '';
  
  templates.forEach(template => {
    const div = document.createElement('div');
    div.className = 'template-item';
    div.innerHTML = `
      <div class="template-text">${template.text}</div>
      <div class="template-actions">
        <button class="btn btn-danger" onclick="deleteTemplate(${template.id})">🗑️ Sil</button>
      </div>
    `;
    list.appendChild(div);
  });
}

// Şablon sil
window.deleteTemplate = async function(id) {
  const data = await chrome.storage.local.get(['templates']);
  const templates = data.templates.filter(t => t.id !== id);
  await chrome.storage.local.set({ templates });
  renderTemplates(templates);
  addLog('Şablon silindi', 'warning');
}

// Zamanlama kaydet
async function saveSchedule() {
  const schedule = {
    workStart: document.getElementById('workStart').value,
    workEnd: document.getElementById('workEnd').value,
    minMessages: parseInt(document.getElementById('minMessages').value),
    maxMessages: parseInt(document.getElementById('maxMessages').value),
    skipWeekends: document.getElementById('skipWeekends').checked,
    distributionMode: document.getElementById('distributionMode').value
  };
  
  await chrome.storage.local.set({ schedule });
  addLog('Zamanlama kaydedildi', 'success');
}

function loadSchedule(schedule) {
  if (schedule.workStart) document.getElementById('workStart').value = schedule.workStart;
  if (schedule.workEnd) document.getElementById('workEnd').value = schedule.workEnd;
  if (schedule.minMessages) document.getElementById('minMessages').value = schedule.minMessages;
  if (schedule.maxMessages) document.getElementById('maxMessages').value = schedule.maxMessages;
  if (schedule.skipWeekends !== undefined) document.getElementById('skipWeekends').checked = schedule.skipWeekends;
  if (schedule.distributionMode) document.getElementById('distributionMode').value = schedule.distributionMode;
}

// Ayarları kaydet
async function saveSettings() {
  const settings = {
    minDelay: parseInt(document.getElementById('minDelay').value),
    maxDelay: parseInt(document.getElementById('maxDelay').value),
    minContactDelay: parseInt(document.getElementById('minContactDelay').value),
    maxContactDelay: parseInt(document.getElementById('maxContactDelay').value),
    hourlyLimit: parseInt(document.getElementById('hourlyLimit').value),
    dailyLimit: parseInt(document.getElementById('dailyLimit').value),
    breakFrequency: parseInt(document.getElementById('breakFrequency').value),
    minBreak: parseInt(document.getElementById('minBreak').value),
    maxBreak: parseInt(document.getElementById('maxBreak').value),
    simulateTyping: document.getElementById('simulateTyping').checked
  };
  
  await chrome.storage.local.set({ settings });
  addLog('Ayarlar kaydedildi', 'success');
}

function loadSettings(settings) {
  if (settings.minDelay) document.getElementById('minDelay').value = settings.minDelay;
  if (settings.maxDelay) document.getElementById('maxDelay').value = settings.maxDelay;
  if (settings.minContactDelay) document.getElementById('minContactDelay').value = settings.minContactDelay;
  if (settings.maxContactDelay) document.getElementById('maxContactDelay').value = settings.maxContactDelay;
  if (settings.hourlyLimit) document.getElementById('hourlyLimit').value = settings.hourlyLimit;
  if (settings.dailyLimit) document.getElementById('dailyLimit').value = settings.dailyLimit;
  if (settings.breakFrequency) document.getElementById('breakFrequency').value = settings.breakFrequency;
  if (settings.minBreak) document.getElementById('minBreak').value = settings.minBreak;
  if (settings.maxBreak) document.getElementById('maxBreak').value = settings.maxBreak;
  if (settings.simulateTyping !== undefined) document.getElementById('simulateTyping').checked = settings.simulateTyping;
}

// Tüm verileri sil
async function clearAllData() {
  if (confirm('TÜM VERİLER SİLİNECEK! Emin misiniz?')) {
    await chrome.storage.local.clear();
    location.reload();
  }
}

// Ayarları sıfırla
async function resetSettings() {
  if (confirm('Ayarlar varsayılana döndürülecek. Emin misiniz?')) {
    await chrome.storage.local.remove(['settings', 'schedule']);
    location.reload();
  }
}

// Log ekle
function addLog(message, type = 'info') {
  const logs = document.getElementById('logs');
  const p = document.createElement('p');
  p.className = `log-item ${type}`;
  p.textContent = `${new Date().toLocaleTimeString('tr-TR')}: ${message}`;
  logs.insertBefore(p, logs.firstChild);
  
  // Maksimum 50 log tut
  while (logs.children.length > 50) {
    logs.removeChild(logs.lastChild);
  }
}

function updateStats(stats) {
  // Stats güncelleme
}

// Background'dan gelen mesajları dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    updateDashboard();
  } else if (message.action === 'log') {
    addLog(message.text, message.type);
  }
});

// Periyodik güncelleme
setInterval(updateDashboard, 2000);