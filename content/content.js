// content.js - WhatsApp Web'e enjekte edilen script
// Bu dosya WhatsApp Web sayfasında çalışır ve mesaj gönderme işlemlerini yapar

console.log('🚀 WhatsApp Toplu Mesaj Gönderici yüklendi!');

let isRunning = false;
let isPaused = false;
let messageQueue = [];
let currentIndex = 0;
let messagesSentToday = 0;
let messagesSentThisHour = 0;
let lastHourReset = Date.now();

// WhatsApp Web selektörleri
const SELECTORS = {
  searchBox: 'div[contenteditable="true"][data-tab="3"]',
  messageBox: 'div[contenteditable="true"][data-tab="10"]',
  sendButton: 'button[data-tab="11"]',
  chatHeader: 'header[data-testid="conversation-header"]',
  messageStatus: 'span[data-icon="msg-check"]',
  errorIcon: 'span[data-icon="alert-notification"]'
};

// Background script'ten mesaj dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSending') {
    startSending(message.data);
    sendResponse({ success: true });
  } else if (message.action === 'pauseSending') {
    isPaused = true;
    sendResponse({ success: true });
  } else if (message.action === 'resumeSending') {
    isPaused = false;
    continueSending();
    sendResponse({ success: true });
  } else if (message.action === 'stopSending') {
    stopSending();
    sendResponse({ success: true });
  }
  return true;
});

// Mesaj göndermeyi başlat
async function startSending(data) {
  if (isRunning) {
    console.log('⚠️ Zaten çalışıyor!');
    return;
  }
  
  isRunning = true;
  isPaused = false;
  messageQueue = data.queue;
  currentIndex = 0;
  
  console.log(`📨 ${messageQueue.length} mesaj kuyruğa alındı`);
  
  await continueSending();
}

// Göndermeye devam et
async function continueSending() {
  while (isRunning && currentIndex < messageQueue.length) {
    if (isPaused) {
      console.log('⏸️ Duraklatıldı, bekleniyor...');
      await sleep(5000);
      continue;
    }
    
    // Saatlik limit kontrolü
    const now = Date.now();
    if (now - lastHourReset > 3600000) {
      messagesSentThisHour = 0;
      lastHourReset = now;
    }
    
    const settings = await chrome.storage.local.get(['settings']);
    const config = settings.settings || getDefaultSettings();
    
    // Limit kontrolü
    if (messagesSentThisHour >= config.hourlyLimit) {
      console.log('⏰ Saatlik limit doldu, 1 saat bekleniyor...');
      notifyBackground('log', 'Saatlik limit doldu, bekleniyor...', 'warning');
      await sleep(60 * 60 * 1000);
      messagesSentThisHour = 0;
      continue;
    }
    
    if (messagesSentToday >= config.dailyLimit) {
      console.log('📅 Günlük limit doldu, durduruluyor...');
      notifyBackground('log', 'Günlük limit doldu!', 'error');
      stopSending();
      break;
    }
    
    // Mola kontrolü
    if (currentIndex > 0 && currentIndex % config.breakFrequency === 0) {
      const breakTime = randomBetween(config.minBreak, config.maxBreak) * 60 * 1000;
      console.log(`☕ Mola veriliyor: ${breakTime / 1000} saniye`);
      notifyBackground('log', `Mola veriliyor: ${Math.round(breakTime / 1000)} saniye`, 'warning');
      await sleep(breakTime);
    }
    
    const item = messageQueue[currentIndex];
    
    try {
      await sendMessage(item.phone, item.message, config);
      
      messagesSentToday++;
      messagesSentThisHour++;
      currentIndex++;
      
      // İstatistikleri güncelle
      updateStats('sent');
      
      console.log(`✅ Mesaj gönderildi: ${item.phone} (${currentIndex}/${messageQueue.length})`);
      notifyBackground('log', `✅ Gönderildi: ${item.contact} (${currentIndex}/${messageQueue.length})`, 'success');
      
    } catch (error) {
      console.error('❌ Hata:', error);
      notifyBackground('log', `❌ Hata: ${item.contact} - ${error.message}`, 'error');
      updateStats('failed');
      currentIndex++;
    }
    
    // Mesajlar arası gecikme
    const delay = randomBetween(config.minDelay, config.maxDelay) * 1000;
    console.log(`⏳ Bekleniyor: ${delay / 1000} saniye`);
    await sleep(delay);
  }
  
  if (currentIndex >= messageQueue.length) {
    console.log('🎉 Tüm mesajlar gönderildi!');
    notifyBackground('log', '🎉 Kampanya tamamlandı!', 'success');
    stopSending();
  }
}

// Mesaj gönder
async function sendMessage(phone, message, config) {
  // 1. Arama kutusunu bul
  const searchBox = await waitForElement(SELECTORS.searchBox, 10000);
  if (!searchBox) {
    throw new Error('Arama kutusu bulunamadı');
  }
  
  // 2. Telefon numarasını ara
  searchBox.click();
  await sleep(500);
  
  // Eski içeriği temizle
  searchBox.innerHTML = '';
  await sleep(200);
  
  // Telefon numarasını yaz
  if (config.simulateTyping) {
    await typeText(searchBox, phone);
  } else {
    searchBox.innerHTML = phone;
    triggerInputEvent(searchBox);
  }
  
  await sleep(2000);
  
  // Enter tuşuna bas
  searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  await sleep(3000);
  
  // 3. Mesaj kutusunu bul
  const messageBox = await waitForElement(SELECTORS.messageBox, 10000);
  if (!messageBox) {
    throw new Error('Mesaj kutusu bulunamadı - numara WhatsApp\'ta olmayabilir');
  }
  
  // 4. Mesajı yaz
  messageBox.click();
  await sleep(500);
  
  messageBox.innerHTML = '';
  await sleep(200);
  
  if (config.simulateTyping) {
    await typeText(messageBox, message);
  } else {
    // Satır sonlarını koru
    const formattedMessage = message.replace(/\n/g, '<br>');
    messageBox.innerHTML = formattedMessage;
    triggerInputEvent(messageBox);
  }
  
  await sleep(1000);
  
  // 5. Gönder butonunu bul ve tıkla
  const sendButton = await waitForElement(SELECTORS.sendButton, 5000);
  if (!sendButton) {
    throw new Error('Gönder butonu bulunamadı');
  }
  
  sendButton.click();
  
  // 6. Mesajın gönderildiğini doğrula
  await sleep(2000);
  
  // Hata kontrolü
  const errorIcon = document.querySelector(SELECTORS.errorIcon);
  if (errorIcon) {
    throw new Error('Mesaj gönderilemedi (WhatsApp hatası)');
  }
  
  return true;
}

// İnsan gibi yazma simülasyonu
async function typeText(element, text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '\n') {
      element.innerHTML += '<br>';
    } else {
      element.innerHTML += char;
    }
    
    triggerInputEvent(element);
    
    // Her karakter arası rastgele gecikme (50-150ms)
    await sleep(randomBetween(50, 150));
    
    // Bazen biraz daha uzun dur (insan gibi düşünme)
    if (Math.random() < 0.1) {
      await sleep(randomBetween(200, 500));
    }
  }
}

// Input event tetikle
function triggerInputEvent(element) {
  const event = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText'
  });
  element.dispatchEvent(event);
}

// Element bekle
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Uyku fonksiyonu
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Rastgele sayı
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// İstatistikleri güncelle
async function updateStats(type) {
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || { sent: 0, failed: 0, total: messageQueue.length };
  
  if (type === 'sent') {
    stats.sent = (stats.sent || 0) + 1;
    stats.sentToday = (stats.sentToday || 0) + 1;
  } else if (type === 'failed') {
    stats.failed = (stats.failed || 0) + 1;
  }
  
  stats.pending = messageQueue.length - currentIndex;
  
  await chrome.storage.local.set({ stats });
  notifyBackground('updateStats');
}

// Background'a bildir
function notifyBackground(action, text = '', type = 'info') {
  chrome.runtime.sendMessage({ action, text, type });
}

// Göndermeyi durdur
function stopSending() {
  isRunning = false;
  isPaused = false;
  messageQueue = [];
  currentIndex = 0;
  console.log('⏹️ Gönderim durduruldu');
}

// Varsayılan ayarlar
function getDefaultSettings() {
  return {
    minDelay: 5,
    maxDelay: 15,
    minContactDelay: 3,
    maxContactDelay: 8,
    hourlyLimit: 300,
    dailyLimit: 5000,
    breakFrequency: 100,
    minBreak: 2,
    maxBreak: 5,
    simulateTyping: true
  };
}

// Sayfa yüklendiğinde
window.addEventListener('load', () => {
  console.log('✅ WhatsApp Web hazır!');
  notifyBackground('log', 'WhatsApp Web bağlantısı kuruldu', 'success');
});