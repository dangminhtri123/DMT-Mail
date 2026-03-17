document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // --- CONFIGURATION ---
    const APP_CONFIG = {
        mode: 'public', // Set to 'private' after deploying Cloudflare Worker
        customDomain: 'mail.dagtridev.site',
        workerApiUrl: 'https://nebula-mail-api.dagtridev.workers.dev', 
    };

    // App State
    let state = {
        token: '',
        accountId: '',
        password: '',
        email: '',
        messages: [],
        currentTab: 'random',
        pollingInterval: null
    };

    // DOM Elements
    const emailDisplay = document.getElementById('email-address');
    const customUserInp = document.getElementById('custom-username');
    const createBtn = document.getElementById('create-btn');
    const copyBtn = document.getElementById('copy-btn');
    const reloadBtn = document.getElementById('reload-inbox-btn');
    const mailList = document.getElementById('mail-list');
    const emptyState = document.getElementById('empty-state');
    const mailCount = document.getElementById('mail-count');
    const connStatus = document.getElementById('connection-status');
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.config-view');
    const modal = document.getElementById('mail-modal');
    const closeModal = document.getElementById('close-modal');
    const modalBody = document.getElementById('mail-body-content');
    const modalSubject = document.getElementById('modal-subject');
    const modalFrom = document.getElementById('modal-from');
    const modalAvatar = document.getElementById('modal-avatar');

    // API Configuration
    const MAILTM_API = 'https://api.mail.tm';

    // Helper functions
    const generateRandomString = (length) => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let res = '';
        for (let i = 0; i < length; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    };

    const updateStatus = (text, type = 'info') => {
        connStatus.textContent = text;
        const dot = document.querySelector('.pulse-dot');
        dot.style.background = type === 'error' ? '#ef4444' : '#10b981';
        dot.style.boxShadow = `0 0 10px ${type === 'error' ? '#ef4444' : '#10b981'}`;
    };

    // Initialize/Create Account
    const createAccount = async (username = null) => {
        updateStatus('Đang khởi tạo...', 'info');
        
        if (APP_CONFIG.mode === 'private') {
            const finalUser = username || generateRandomString(8);
            state.email = `${finalUser}@${APP_CONFIG.customDomain}`;
            emailDisplay.textContent = state.email;
            updateStatus('Đang hoạt động (Private)', 'success');
            fetchMessages();
            startPolling();
        } else {
            try {
                // 1. Get Domain
                const domainsRes = await fetch(`${MAILTM_API}/domains`);
                const domainsData = await domainsRes.json();
                const domain = domainsData['hydra:member'][0].domain;

                // 2. Prepare Credentials
                const finalUser = username || generateRandomString(10);
                const password = generateRandomString(12);
                const email = `${finalUser}@${domain}`;
                
                // 3. Create
                const createRes = await fetch(`${MAILTM_API}/accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: email, password: password })
                });

                if (!createRes.ok) throw new Error('Không thể tạo tài khoản');
                
                // 4. Auth
                const tokenRes = await fetch(`${MAILTM_API}/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: email, password: password })
                });
                const tokenData = await tokenRes.json();
                
                state.token = tokenData.token;
                state.email = email;
                state.password = password;

                // UI Update
                emailDisplay.textContent = state.email;
                updateStatus('Đang hoạt động', 'success');
                
                state.messages = [];
                renderMessages();
                fetchMessages();
                startPolling();

            } catch (error) {
                console.error(error);
                updateStatus('Không thể tạo mail. Hãy thử tên khác.', 'error');
                emailDisplay.textContent = 'Oops! Lỗi.';
            }
        }
    };

    const fetchMessages = async () => {
        if (APP_CONFIG.mode === 'private') {
            try {
                const res = await fetch(`${APP_CONFIG.workerApiUrl}/messages?email=${state.email}`);
                const newMessages = await res.json();
                if (JSON.stringify(newMessages) !== JSON.stringify(state.messages)) {
                    state.messages = newMessages;
                    renderMessages();
                }
            } catch (e) { updateStatus('Private API Error', 'error'); }
        } else {
            if (!state.token) return;
            try {
                const res = await fetch(`${MAILTM_API}/messages`, {
                    headers: { 'Authorization': `Bearer ${state.token}` }
                });
                const data = await res.json();
                const newMessages = data['hydra:member'];
                if (JSON.stringify(newMessages) !== JSON.stringify(state.messages)) {
                    state.messages = newMessages;
                    renderMessages();
                }
            } catch (error) { updateStatus('Sync error', 'error'); }
        }
    };

    const renderMessages = () => {
        mailCount.textContent = state.messages.length;
        if (state.messages.length === 0) {
            emptyState.style.display = 'block';
            mailList.querySelectorAll('.mail-item').forEach(el => el.remove());
            return;
        }

        emptyState.style.display = 'none';
        
        // Use a document fragment for efficient rendering
        const fragment = document.createDocumentFragment();
        state.messages.forEach(msg => {
            const sender = APP_CONFIG.mode === 'private' ? (msg.from || 'Unknown') : (msg.from.name || msg.from.address);
            const date = APP_CONFIG.mode === 'private' ? new Date(msg.date) : new Date(msg.createdAt);
            
            const item = document.createElement('div');
            item.className = 'mail-item';
            item.setAttribute('data-id', msg.id);
            item.innerHTML = `
                <div class="avatar">${sender.charAt(0).toUpperCase()}</div>
                <div class="mail-item-content">
                    <div class="mail-item-top">
                        <div class="mail-sender">${sender}</div>
                        <div class="mail-time">${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div class="mail-subject">${msg.subject}</div>
                </div>
            `;
            item.onclick = async () => openMessage(msg.id);
            fragment.appendChild(item);
        });

        // Clear existing items and append new ones
        mailList.querySelectorAll('.mail-item').forEach(el => el.remove());
        mailList.appendChild(fragment);
    };

    const openMessage = async (msgId) => {
        const msg = state.messages.find(m => m.id === msgId);
        if (!msg) return;

        updateStatus('Đang tải thư...', 'info');
        
        let detail = msg;
        if (APP_CONFIG.mode === 'public') {
            try {
                detail = await fetch(`${MAILTM_API}/messages/${msgId}`, {
                    headers: { 'Authorization': `Bearer ${state.token}` }
                }).then(r => r.json());
            } catch (e) {
                updateStatus('Lỗi tải thư', 'error');
                return;
            }
        }

        modalSubject.textContent = detail.subject;
        const fromAddr = APP_CONFIG.mode === 'private' ? detail.from : detail.from.address;
        modalFrom.textContent = `Từ: ${fromAddr}`;
        modalAvatar.textContent = fromAddr.charAt(0).toUpperCase();
        
        const content = APP_CONFIG.mode === 'private' ? (detail.html || detail.text) : (detail.html ? detail.html[0] : detail.text);
        
        if (detail.html) {
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.minHeight = '400px';
            iframe.style.border = 'none';
            modalBody.innerHTML = '';
            modalBody.appendChild(iframe);
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(content);
            doc.close();
        } else {
            modalBody.innerHTML = `<div style="white-space: pre-wrap; color: #fff; font-size: 0.95rem; line-height: 1.6;">${content}</div>`;
        }

        modal.style.display = 'block';
        updateStatus('Đang hoạt động', 'success');
    };

    const startPolling = () => {
        if (state.pollingInterval) clearInterval(state.pollingInterval);
        state.pollingInterval = setInterval(fetchMessages, 4000);
    };

    // --- Events ---

    // Tab Switching
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab') + '-ui';
            document.getElementById(targetId).classList.add('active');
            state.currentTab = tab.getAttribute('data-tab');
        };
    });

    createBtn.onclick = () => {
        if (state.currentTab === 'custom') {
            const val = customUserInp.value.trim();
            if (!val || val.length < 3) {
                alert('Vui lòng nhập tên từ 3 ký tự trở lên');
                return;
            }
            createAccount(val);
        } else {
            createAccount();
        }
    };

    copyBtn.onclick = () => {
        if (!state.email) return;
        navigator.clipboard.writeText(state.email).then(() => {
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i data-lucide="check"></i> Đã Copy';
            lucide.createIcons();
            setTimeout(() => {
                copyBtn.innerHTML = originalIcon;
                lucide.createIcons();
            }, 2000);
        });
    };

    reloadBtn.onclick = () => {
        const icon = reloadBtn.querySelector('i');
        icon.style.animation = 'spin 1s linear infinite';
        fetchMessages().then(() => {
            setTimeout(() => icon.style.animation = '', 600);
        });
    };

    closeModal.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

    // Initial Start
    createAccount();
});
