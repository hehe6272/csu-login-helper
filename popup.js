const $ = id => document.getElementById(id);

async function showPageStatus() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.url?.startsWith('https://portal.csu.edu.tw/index.aspx')) return;
  try {
    const status = await chrome.tabs.sendMessage(tab.id, {type: 'GET_STATUS'});
    if (status?.message) $('notice').textContent = status.message;
  } catch (_) {
    // The page may still be loading.
  }
}

chrome.storage.local.get({autoCredentials: true, autoCaptcha: true, username: '', password: ''}).then(settings => {
  $('autoCredentials').checked = settings.autoCredentials;
  $('autoCaptcha').checked = settings.autoCaptcha;
  $('username').value = settings.username;
  $('password').value = settings.password;
  showPageStatus();
});

for (const key of ['autoCredentials', 'autoCaptcha']) {
  $(key).addEventListener('change', async event => {
    await chrome.storage.local.set({[key]: event.target.checked});
    $('notice').textContent = event.target.checked ? '已開啟' : '已關閉';
  });
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({username: $('username').value.trim(), password: $('password').value});
  $('notice').textContent = '帳號與密碼已儲存在這個瀏覽器的擴充功能資料中';
});

