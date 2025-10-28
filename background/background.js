// background.js - Background Service Worker
// Mesaj kuyruğu yönetimi ve zamanlama işlemleri

console.log('🚀 WhatsApp Bulk Sender Background Service başlatıldı');

let campaignStatus = 'stopped';
let messageQueue = [];

// Popup'tan gelen mesajları dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Mesaj alındı:', message.action);
  
  if (message.action === 'startCampaign') {
    handleStartCampaign();
    sendResponse({ success: true });
  } else if (message.action === 'pauseCampaign') {
    handlePauseCampaign();
    sendResponse({ success: true });
  } else if (message.action === 'stopCampaign') {
    handleStopCampaign();
    sendResponse({ success: true });
  } else if (message.action === 'log') {
    // Log mesajlarını ilet
    sendResponse({ success: true });
  } else if (message.action === 'updateStats') {
    // İstatistik güncellemelerini ilet
    sendResponse({ success: true });
  }
  
  return true;
});

// Kampanyayı başlat
async function handleStartCampaign() {
  try {
    console.log('🚀 Kampanya başlatılıyor...');
    
    // Verileri al
    const data = await chrome.storage.local.get(['contacts', 'templates', 'settings', 'schedule']);
    
    if (!data.contacts || data.contacts.length === 0) {
      console.error('❌ Kişi listesi boş!');
      return;
    }
    
    if (!data.templates || data.templates.length === 0) {
      console.error('❌ Mesaj şablonu yok!');
      return;
    }
    
    // Mesaj kuyruğu oluştur
    messageQueue = await buildMessageQueue(data);
    
    console.log(`📋 ${messageQueue.length} mesaj kuyruğa alındı`);
    
    // İstatistikleri sıfırla
    await chrome.storage.local.set({
      stats: {
        sent: 0,
        failed: 0,
        pending: messageQueue.length,
        total: messageQueue.length,
        sentToday: 0
      }
    });
    
    // WhatsApp Web sekmesini bul veya aç
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    
    let whatsappTab;
    if (tabs.length > 0) {
      whatsappTab = tabs[0];
      await chrome.tabs.update(whatsappTab.id, { active: true });
    } else {
      whatsappTab = await chrome.tabs.create({ url: 'https://web.whatsapp.com' });
      // WhatsApp Web'in yüklenmesi için bekle
      await sleep(10000);
    }
    
    // Content script'e mesaj gönder
    await chrome.tabs.sendMessage(whatsappTab.id, {
      action: 'startSending',
      data: {
        queue: messageQueue
      }
    });
    
    campaignStatus = 'running';
    await chrome.storage.local.set({ campaignStatus: 'running' });
    
    console.log('✅ Kampanya başlatıldı!');
    
  } catch (error) {
    console.error('❌ Kampanya başlatma hatası:', error);
  }
}

// Kampanyayı duraklat
async function handlePauseCampaign() {
  console.log('⏸️ Kampanya duraklatılıyor...');
  
  campaignStatus = 'paused';
  await chrome.storage.local.set({ campaignStatus: 'paused' });
  
  // WhatsApp Web sekmesine duraklat mesajı gönder
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length > 0) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'pauseSending' });
  }
  
  console.log('✅ Kampanya duraklatıldı');
}

// Kampanyayı durdur
async function handleStopCampaign() {
  console.log('⏹️ Kampanya durduruluyor...');
  
  campaignStatus = 'stopped';
  messageQueue = [];
  await chrome.storage.local.set({ campaignStatus: 'stopped' });
  
  // WhatsApp Web sekmesine durdur mesajı gönder
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length > 0) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'stopSending' });
  }
  
  console.log('✅ Kampanya durduruldu');
}

// Mesaj kuyruğu oluştur
async function buildMessageQueue(data) {
  const { contacts, templates, settings, schedule } = data;
  
  const queue = [];
  
  const scheduleConfig = schedule || {
    minMessages: 10,
    maxMessages: 15,
    workStart: '09:00',
    workEnd: '21:00',
    distributionMode: 'even'
  };
  
  // Her kişi için mesajlar oluştur
  for (const contact of contacts) {
    // Her kişiye gönderilecek mesaj sayısı
    const messageCount = randomBetween(scheduleConfig.minMessages, scheduleConfig.maxMessages);
    
    // Rastgele şablonlar seç
    for (let i = 0; i < messageCount; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      
      // Değişkenleri değiştir
      let message = template.text;
      message = message.replace(/{isim}/g, contact.name);
      message = message.replace(/{var1}/g, contact.var1 || '');
      message = message.replace(/{var2}/g, contact.var2 || '');
      message = message.replace(/{tarih}/g, new Date().toLocaleDateString('tr-TR'));
      message = message.replace(/{saat}/g, new Date().toLocaleTimeString('tr-TR'));
      
      queue.push({
        contact: contact.name,
        phone: contact.phone,
        message: message,
        scheduledTime: calculateScheduledTime(i, messageCount, scheduleConfig)
      });
    }
  }
  
  // Zamanlamaya göre sırala
  queue.sort((a, b) => a.scheduledTime - b.scheduledTime);
  
  return queue;
}

// Zamanlama hesapla
function calculateScheduledTime(index, total, config) {
  const now = new Date();
  
  // Mesai saatleri
  const [startHour, startMin] = config.workStart.split(':').map(Number);
  const [endHour, endMin] = config.workEnd.split(':').map(Number);
  
  const workMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  // Mesajları eşit dağıt
  const intervalMinutes = workMinutes / total;
  const offsetMinutes = index * intervalMinutes;
  
  const scheduledTime = new Date(now);
  scheduledTime.setHours(startHour, startMin + offsetMinutes, 0, 0);
  
  return scheduledTime.getTime();
}

// Rastgele sayı
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Uyku fonksiyonu
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Bildirim gönder
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message
  });
}

// Her gün sıfırlama için alarm kur
chrome.alarms.create('dailyReset', { periodInMinutes: 1440 }); // 24 saat

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    resetDailyStats();
  }
});

async function resetDailyStats() {
  const data = await chrome.storage.local.get(['stats']);
  if (data.stats) {
    data.stats.sentToday = 0;
    await chrome.storage.local.set({ stats: data.stats });
    console.log('📅 Günlük istatistikler sıfırlandı');
  }
}

console.log('✅ Background service hazır');