(() => {
  const account = document.getElementById('login_code');
  const password = document.getElementById('login_pwd');
  const answer = document.getElementById('login_vd');
  const image = document.getElementById('verifyimage');
  if (!account || !password || !answer || !image) return;

  let settings = {autoCredentials: true, autoCaptcha: true, username: '', password: ''};
  let lastImage = '';
  let lastAutoAnswer = '';
  let status = '尚未開啟自動辨識';

  function setField(field, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(field, value);
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
  }

  function fillCredentials() {
    if (!settings.autoCredentials) return;
    if (settings.username && !account.value) setField(account, settings.username);
    if (settings.password && !password.value) setField(password, settings.password);
  }

  function detect(force = false) {
    if (!settings.autoCaptcha) { status = '已關閉自動辨識'; return; }
    if (!image.complete || !image.naturalWidth) { status = '等待驗證圖載入'; return; }
    let signature;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 50;
      canvas.getContext('2d').drawImage(image, 0, 0, 180, 50);
      signature = canvas.toDataURL('image/png');
    } catch (_) {
      status = '無法讀取驗證圖，請手動輸入';
      return;
    }
    if (!force && signature === lastImage) {
      if (!answer.value && lastAutoAnswer) setField(answer, lastAutoAnswer);
      return;
    }
    lastImage = signature;

    let result;
    try {
      result = CsuDetector.solve(image);
    } catch (_) {
      status = '辨識程式發生錯誤，請手動輸入';
      return;
    }
    if (!result) { status = '無法辨識這張驗證圖，請手動輸入'; return; }
    if (answer.value && answer.value !== lastAutoAnswer && !force) {
      status = '已保留你手動輸入的驗證值';
      return;
    }
    setField(answer, result.answer);
    lastAutoAnswer = result.answer;
    status = `辨識為 ${result.formula}，已填入 ${result.answer}${result.confidence === 'low' ? '（請特別核對）' : '（請確認）'}`;
  }

  async function refreshSettings() {
    settings = await chrome.storage.local.get({autoCredentials: true, autoCaptcha: true, username: '', password: ''});
    fillCredentials();
    if (settings.autoCaptcha) detect();
    else status = '已關閉自動辨識';
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.autoCaptcha?.newValue) lastImage = '';
    refreshSettings();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_STATUS') sendResponse({message: status});
  });
  image.addEventListener('load', () => detect());
  image.addEventListener('click', () => setTimeout(() => detect(), 350));
  new MutationObserver(() => detect()).observe(image, {attributes: true, attributeFilter: ['src']});
  setInterval(() => { if (settings.autoCaptcha) detect(); }, 1500);
  refreshSettings();
})();
