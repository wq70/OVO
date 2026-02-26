// --- 小组件管理 (js/modules/widgets.js) ---

// 小组件头像默认图（与 ui.js 中初始化保持一致）
const DEFAULT_INS_AVATAR1 = 'https://i.postimg.cc/Y96LPskq/o-o-2.jpg';
const DEFAULT_INS_AVATAR2 = 'https://i.postimg.cc/GtbTnxhP/o-o-1.jpg';

function setupInsWidgetAvatarModal() {
    const modal = document.getElementById('ins-widget-avatar-modal');
    const form = document.getElementById('ins-widget-avatar-form');
    const preview = document.getElementById('ins-widget-avatar-preview');
    const urlInput = document.getElementById('ins-widget-avatar-url-input');
    const fileUpload = document.getElementById('ins-widget-avatar-file-upload');
    const targetInput = document.getElementById('ins-widget-avatar-target');

    // Use event delegation on homeScreen for avatars since it's re-rendered
    const homeScreen = document.getElementById('home-screen');
    homeScreen.addEventListener('click', (e) => {
        const avatar1 = e.target.closest('#ins-widget-avatar-1');
        const avatar2 = e.target.closest('#ins-widget-avatar-2');

        let targetAvatarId = null;
        let currentSrc = '';

        if (avatar1) {
            targetAvatarId = 'avatar1';
            currentSrc = db.insWidgetSettings.avatar1;
        } else if (avatar2) {
            targetAvatarId = 'avatar2';
            currentSrc = db.insWidgetSettings.avatar2;
        }

        if (targetAvatarId) {
            targetInput.value = targetAvatarId;
            preview.style.backgroundImage = `url("${currentSrc}")`;
            preview.innerHTML = ''; // Clear "预览" text
            urlInput.value = '';
            fileUpload.value = null;
            modal.classList.add('visible');
        }
    });

    // Handle URL input
    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        if (url) {
            preview.style.backgroundImage = `url("${url}")`;
            preview.innerHTML = '';
            fileUpload.value = null; // Clear file input if URL is used
        } else {
            preview.style.backgroundImage = 'none';
            preview.innerHTML = '<span>预览</span>';
        }
    });

    // Handle file upload
    fileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 200, maxHeight: 200 });
                preview.style.backgroundImage = `url("${compressedUrl}")`;
                preview.innerHTML = '';
                urlInput.value = ''; // Clear URL input if file is used
            } catch (error) {
                showToast('图片压缩失败，请重试');
                preview.style.backgroundImage = 'none';
                preview.innerHTML = '<span>预览</span>';
            }
        }
    });

    // 重置为默认头像
    const resetBtn = document.getElementById('ins-widget-avatar-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const targetAvatar = targetInput.value;
            if (!targetAvatar) return;

            let defaultSrc = '';
            if (targetAvatar === 'centralCircle') {
                defaultSrc = defaultWidgetSettings.centralCircleImage;
                db.homeWidgetSettings.centralCircleImage = defaultSrc;
            } else if (targetAvatar === 'avatar1') {
                defaultSrc = DEFAULT_INS_AVATAR1;
                db.insWidgetSettings.avatar1 = defaultSrc;
            } else if (targetAvatar === 'avatar2') {
                defaultSrc = DEFAULT_INS_AVATAR2;
                db.insWidgetSettings.avatar2 = defaultSrc;
            }

            if (!defaultSrc) return;
            await saveData();
            setupHomeScreen();
            modal.classList.remove('visible');
            showToast('已重置为默认头像');
        });
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetAvatar = targetInput.value;
        const bgImage = preview.style.backgroundImage;
        const newSrc = bgImage.slice(5, -2); // Extract URL from 'url("...")'

        if (!targetAvatar || !newSrc) {
            showToast('没有要保存的图片');
            return;
        }

        if (targetAvatar === 'centralCircle') {
            db.homeWidgetSettings.centralCircleImage = newSrc;
        } else if (targetAvatar === 'avatar1') {
            db.insWidgetSettings.avatar1 = newSrc;
        } else if (targetAvatar === 'avatar2') {
            db.insWidgetSettings.avatar2 = newSrc;
        }

        await saveData();
        setupHomeScreen(); // Re-render the home screen to show the new avatar
        modal.classList.remove('visible');
        showToast('头像已更新');
    });
}

function updatePolaroidImage(imageUrl) {
   const styleId = 'polaroid-image-style';
   let styleElement = document.getElementById(styleId);
   if (!styleElement) {
       styleElement = document.createElement('style');
       styleElement.id = styleId;
       document.head.appendChild(styleElement);
   }
   styleElement.innerHTML = `
       .heart-photo-widget::after {
           background-image: url('${imageUrl}');
       }
   `;
}

function setupHeartPhotoModal() {
   const widget = document.querySelector('.heart-photo-widget');
   const modal = document.getElementById('heart-photo-modal');
   const form = document.getElementById('heart-photo-form');
   const preview = document.getElementById('heart-photo-preview');
   const urlInput = document.getElementById('heart-photo-url-input');
   const fileUpload = document.getElementById('heart-photo-file-upload');

   if (!widget || !modal || !form) return;

   // 1. Open modal on widget click/tap
   const openModalAction = () => {
       const currentImage = db.homeWidgetSettings?.polaroidImage || 'https://i.postimg.cc/XvFDdTKY/Smart-Select-20251013-023208.jpg';
       preview.style.backgroundImage = `url("${currentImage}")`;
       preview.innerHTML = '';
       urlInput.value = '';
       fileUpload.value = null;
       modal.classList.add('visible');
   };

   // 需要在 setupHomeScreen 后再次绑定，或者使用事件委托。
   // 这里假设 setupHomeScreen 会创建 .heart-photo-widget
   // 更好的方式是像 setupInsWidgetAvatarModal 那样委托给 homeScreen
   
   // 使用事件委托处理拍立得点击
   const homeScreen = document.getElementById('home-screen');
   homeScreen.addEventListener('click', (e) => {
       if (e.target.classList.contains('heart-photo-widget')) {
           openModalAction();
       }
   });
   
   // 2. Handle image preview (URL input)
   urlInput.addEventListener('input', () => {
       const url = urlInput.value.trim();
       if (url) {
           preview.style.backgroundImage = `url("${url}")`;
           preview.innerHTML = '';
           fileUpload.value = null; // Clear file input
       } else {
           preview.style.backgroundImage = 'none';
           preview.innerHTML = '<span>预览</span>';
       }
   });

   // 3. Handle image preview (File upload)
   fileUpload.addEventListener('change', async (e) => {
       const file = e.target.files[0];
       if (file) {
           try {
               const compressedUrl = await compressImage(file, { quality: 0.8, maxWidth: 400, maxHeight: 400 });
               preview.style.backgroundImage = `url("${compressedUrl}")`;
               preview.innerHTML = '';
               urlInput.value = ''; // Clear URL input
           } catch (error) {
               showToast('图片压缩失败，请重试');
               preview.style.backgroundImage = 'none';
               preview.innerHTML = '<span>预览</span>';
           }
       }
   });

   // 4. Handle form submission
   form.addEventListener('submit', async (e) => {
       e.preventDefault();
       const bgImage = preview.style.backgroundImage;
       const newSrc = bgImage.slice(5, -2); // Extract URL from 'url("...")'

       if (!newSrc) {
           showToast('没有要保存的图片');
           return;
       }

       // Ensure homeWidgetSettings exists
       if (!db.homeWidgetSettings) {
           db.homeWidgetSettings = JSON.parse(JSON.stringify(defaultWidgetSettings));
       }
       db.homeWidgetSettings.polaroidImage = newSrc;

       await saveData();
       
       updatePolaroidImage(newSrc);

       modal.classList.remove('visible');
       showToast('拍立得照片已更新');
   });
}
