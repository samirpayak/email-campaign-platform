
        // User database
        // ⚠️ IMPORTANT SECURITY NOTICE ⚠️
        // ===========================================
        // DO NOT hardcode credentials in HTML!
        // This is a SECURITY VULNERABILITY
        // 
        // PRODUCTION SETUP REQUIRED:
        // 1. Use a backend server for authentication
        // 2. Store passwords in a secure database (bcrypt hashed)
        // 3. Use environment variables for secrets
        // 4. Never expose credentials in client-side code
        // 5. Implement proper session management on server
        // ===========================================
        
        // ── Backend API Configuration ──────────────────────────────────────
        // Auto-detect API base URL based on environment
        const API_BASE = (() => {
            // In production (Vercel), use same domain
            if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                return window.location.origin + '/api';
            }
            // In development, use localhost
            return 'http://localhost:5000/api';
        })();

        console.log('✓ API Base configured:', API_BASE);

        async function apiCall(endpoint, method, body, requiresAuth) {
            const headers = { 'Content-Type': 'application/json' };
            if (requiresAuth) {
                const token = localStorage.getItem('tg_token');
                if (token) headers['Authorization'] = 'Bearer ' + token;
            }
            const res = await fetch(API_BASE + endpoint, {
                method: method || 'GET',
                headers,
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Request failed');
            return data;
        }

        let currentUser = null;
        
        // ─── Session Persistence (JWT based) ────────────────────────────
        function saveSession(token, user) {
            localStorage.setItem('tg_token', token);
            localStorage.setItem('tg_user', JSON.stringify(user));
        }

        function loadSession() {
            const user = localStorage.getItem('tg_user');
            return user ? JSON.parse(user) : null;
        }

        function clearSession() {
            localStorage.removeItem('tg_token');
            localStorage.removeItem('tg_user');
        }

        // Check if user is already logged in on page load
        window.addEventListener('load', async function() {
            const token = localStorage.getItem('tg_token');
            const savedUser = loadSession();
            if (token && savedUser) {
                try {
                    const data = await apiCall('/auth/verify', 'POST', null, true);
                    if (data.success) {
                        currentUser = savedUser;
                        showDashboard();
                        loadDashboardData();
                    } else {
                        clearSession();
                    }
                } catch(e) {
                    clearSession();
                }
            }
        });
        let campaigns = [];
        let groups = [];
        let uploadedData = [];
        let columns = [];
        
        function switchLoginTab(tab, clickedBtn) {
            document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
            document.querySelectorAll('.login-tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tab === 'login' ? 'loginForm' : 'signupForm').classList.add('active');
            if (clickedBtn) {
                clickedBtn.classList.add('active');
            } else {
                document.querySelectorAll('.login-tab-btn').forEach(b => {
                    if ((tab === 'login' && b.textContent.trim() === 'Login') ||
                        (tab === 'signup' && b.textContent.trim() === 'Signup')) {
                        b.classList.add('active');
                    }
                });
            }
        }
        
        function setDemoUser(email, password) {
            document.getElementById('loginEmail').value = email;
            document.getElementById('loginPassword').value = password;
        }
        
        async function handleLogin(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            const btn = e.target.querySelector('button[type="submit"]') || document.querySelector('#loginForm .button-login');
            if (btn) { btn.textContent = 'Logging in...'; btn.disabled = true; }

            try {
                const data = await apiCall('/auth/login', 'POST', { email, password });
                saveSession(data.token, data.user);
                currentUser = data.user;
                showDashboard();
                loadDashboardData();
                showLoginNotice('Welcome back, ' + data.user.name + '!', 'success');
            } catch(err) {
                showLoginNotice(err.message, 'error');
            } finally {
                if (btn) { btn.textContent = 'Login'; btn.disabled = false; }
            }
        }
        
        async function handleSignup(e) {
            e.preventDefault();
            const name = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const confirm = document.getElementById('signupConfirm').value;

            if (!name) { showSignupNotice('Please enter your full name.'); return; }
            if (!email || email.length < 3) { showSignupNotice('Please enter a valid User ID (minimum 3 characters).'); return; }
            if (password.length < 6) { showSignupNotice('Password must be at least 6 characters.'); return; }
            if (password !== confirm) { showSignupNotice('Passwords do not match.'); return; }

            const btn = document.querySelector('#signupForm .button-login');
            if (btn) { btn.textContent = 'Creating account...'; btn.disabled = true; }

            try {
                await apiCall('/auth/signup', 'POST', { name, email, password });
                document.getElementById('signupForm').reset();
                switchLoginTab('login');
                document.getElementById('loginEmail').value = email;
                document.getElementById('loginPassword').value = password;
                showLoginNotice('Account created! Awaiting admin approval before you can login.', 'success');
            } catch(err) {
                showSignupNotice(err.message);
            } finally {
                if (btn) { btn.textContent = 'Create Account'; btn.disabled = false; }
            }
        }

        function showSignupNotice(msg) {
            let el = document.getElementById('signupNotice');
            if (!el) {
                el = document.createElement('div');
                el.id = 'signupNotice';
                el.style.cssText = 'padding:10px 14px;border-radius:8px;margin-bottom:1rem;font-size:13px;font-weight:600;text-align:center;background:#fee2e2;color:#ef4444;';
                const form = document.getElementById('signupForm');
                form.insertBefore(el, form.firstChild);
            }
            el.textContent = msg;
            el.style.display = 'block';
            setTimeout(function(){ el.style.display = 'none'; }, 4000);
        }
        
        function showLoginNotice(msg, type) {
            let notice = document.getElementById('loginNotice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'loginNotice';
                notice.style.cssText = 'padding:10px 14px;border-radius:8px;margin-bottom:1rem;font-size:13px;font-weight:600;text-align:center;';
                const loginForm = document.getElementById('loginForm');
                loginForm.insertBefore(notice, loginForm.firstChild);
            }
            notice.textContent = msg;
            notice.style.background = type === 'success' ? '#d1fae5' : '#fee2e2';
            notice.style.color = type === 'success' ? '#2E7D32' : '#ef4444';
            notice.style.display = 'block';
            setTimeout(() => { notice.style.display = 'none'; }, 5000);
        }

        function showDashboard() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardScreen').classList.add('active');
            
            const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('userInitials').textContent = initials;
            document.getElementById('currentUserName').textContent = currentUser.name;
            document.getElementById('currentUserRole').textContent = currentUser.role;

            // Show User Log tab only for Administrator
            const userLogTab = document.getElementById('userLogTab');
            if (userLogTab) {
                userLogTab.style.display = currentUser.role === 'Administrator' ? 'block' : 'none';
            }
            
            updateDashboard();
            updatePendingBadge();
        }

        async function renderUserLog() {
            const tbody = document.getElementById('userLogTableBody');
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary);">Loading users...</td></tr>';
            try {
                const data = await apiCall('/users', 'GET', null, true);
                const users = data.users;
                document.getElementById('totalUsersCount').textContent = data.stats.total;
                document.getElementById('pendingUsersCount').textContent = data.stats.pending;
                document.getElementById('approvedUsersCount').textContent = data.stats.approved;
                document.getElementById('rejectedUsersCount').textContent = data.stats.rejected;
                updatePendingBadgeCount(data.stats.pending);

                tbody.innerHTML = users.map((u, i) => {
                    const roleColor = u.role === 'Administrator' ? '#1e40af' : u.role === 'Manager' ? '#92400e' : '#2E7D32';
                    const roleBg = u.role === 'Administrator' ? '#dbeafe' : u.role === 'Manager' ? '#fef3c7' : '#d1fae5';
                    const statusBadge = u.status === 'approved'
                        ? '<span class="status-badge status-valid">Approved</span>'
                        : u.status === 'pending'
                        ? '<span class="status-badge" style="background:#fef9c3;color:#854d0e;">Pending</span>'
                        : '<span class="status-badge status-invalid">Rejected</span>';
                    const actions = u.role === 'Administrator' ? '<span style="font-size:11px;color:var(--text-secondary);">—</span>' :
                        u.status === 'pending' ? `
                            <button onclick="approveUser('${u._id}')" style="background:#d1fae5;color:#2E7D32;border:none;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px;">✓ Approve</button>
                            <button onclick="rejectUser('${u._id}')" style="background:#fee2e2;color:#ef4444;border:none;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;">✕ Reject</button>
                        ` : u.status === 'approved' ? `
                            <button onclick="rejectUser('${u._id}')" style="background:#fee2e2;color:#ef4444;border:none;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;">✕ Revoke</button>
                        ` : `
                            <button onclick="approveUser('${u._id}')" style="background:#d1fae5;color:#2E7D32;border:none;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;">✓ Approve</button>
                        `;
                    const regDate = u.registeredAt ? new Date(u.registeredAt).toLocaleString() : '-';
                    return `<tr>
                        <td>${i + 1}</td>
                        <td style="font-weight:600;">${u.name} ${u.emailVerified ? '<span title="Email Verified" style="color:#2E7D32;font-size:12px;">✔️</span>' : ''}</td>
                        <td style="font-size:12px;">${u.email}</td>
                        <td><span class="status-badge" style="background:${roleBg};color:${roleColor};">${u.role}</span></td>
                        <td>${statusBadge}</td>
                        <td style="font-size:11px;color:var(--text-secondary);">${regDate}</td>
                        <td>${actions}</td>
                    </tr>`;
                }).join('');
            } catch(err) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:1rem;">Failed to load users: ' + err.message + '</td></tr>';
            }
        }

        async function approveUser(userId) {
            try {
                await apiCall('/users/' + userId + '/approve', 'PUT', null, true);
                renderUserLog();
            } catch(err) { alert('Failed: ' + err.message); }
        }

        async function rejectUser(userId) {
            try {
                await apiCall('/users/' + userId + '/reject', 'PUT', null, true);
                renderUserLog();
            } catch(err) { alert('Failed: ' + err.message); }
        }

        function updatePendingBadge() {}
        function updatePendingBadgeCount(count) {
            const badge = document.getElementById('pendingBadge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        }
        
        function handleLogout() {
            if (confirm('Are you sure you want to logout?')) {
                currentUser = null;
                clearSession();
                document.getElementById('dashboardScreen').classList.remove('active');
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('loginForm').reset();
                document.getElementById('signupForm').reset();
            }
        }
        
        function switchTab(tab, evt) {
            document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            if (evt && evt.target) evt.target.classList.add('active');
            if (tab === 'compose') updateGroupDropdown();
            if (tab === 'userlog') renderUserLog();
            if (tab === 'managegroups') loadAllGroups();
        }
        
        // File Upload Handlers
        function handleDragOver(e) {
            e.preventDefault();
            document.getElementById('uploadZone').classList.add('dragover');
        }
        
        function handleDragLeave(e) {
            e.preventDefault();
            document.getElementById('uploadZone').classList.remove('dragover');
        }
        
        function handleDrop(e) {
            e.preventDefault();
            document.getElementById('uploadZone').classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect({ target: { files } });
            }
        }
        
        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const fileName = file.name;
            const ext = fileName.split('.').pop().toLowerCase();
            
            if (ext === 'csv') {
                const reader = new FileReader();
                reader.onload = (event) => {
                    parseCSV(event.target.result, fileName);
                };
                reader.readAsText(file);
            } else if (['xlsx', 'xls'].includes(ext)) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    parseExcel(event.target.result, fileName);
                };
                reader.readAsArrayBuffer(file);
            } else {
                alert('Please upload a CSV or Excel file');
            }
        }
        
        function parseCSV(text, fileName) {
            const lines = text.split('\n').map(line => line.trim()).filter(line => line);
            if (lines.length === 0) return;
            
            const headers = lines[0].split(',').map(h => h.trim());
            columns = headers;
            
            const data = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim());
                const row = {};
                headers.forEach((header, i) => {
                    row[header] = values[i] || '';
                });
                return row;
            });
            
            uploadedData = data;
            displayUploadPreview(fileName, headers);
        }
        
        function parseExcel(arrayBuffer, fileName) {
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            if (jsonData.length === 0) return;
            
            columns = Object.keys(jsonData[0]);
            uploadedData = jsonData;
            displayUploadPreview(fileName, columns);
        }
        
        function displayUploadPreview(fileName, headersList) {
            document.getElementById('fileInfo').classList.add('show');
            document.getElementById('fileName').textContent = fileName;
            document.getElementById('rowCount').textContent = uploadedData.length;
            
            const emailSelect = document.getElementById('emailColumn');
            const nameSelect = document.getElementById('nameColumn');
            
            emailSelect.innerHTML = '<option value="">Auto-detect email column...</option>';
            nameSelect.innerHTML = '<option value="">No name column</option>';
            
            headersList.forEach(header => {
                const emailOption = document.createElement('option');
                emailOption.value = header;
                emailOption.textContent = header;
                emailSelect.appendChild(emailOption);
                
                const nameOption = document.createElement('option');
                nameOption.value = header;
                nameOption.textContent = header;
                nameSelect.appendChild(nameOption);
            });
            
            const emailHeaders = headersList.filter(h => h.toLowerCase().includes('email'));
            if (emailHeaders.length > 0) {
                emailSelect.value = emailHeaders[0];
            }
            
            const nameHeaders = headersList.filter(h => h.toLowerCase().includes('name') && !h.toLowerCase().includes('email'));
            if (nameHeaders.length > 0) {
                nameSelect.value = nameHeaders[0];
            }
            
            showUploadPreview();
        }
        
        function showUploadPreview() {
            document.getElementById('previewEmpty').style.display = 'none';
            document.getElementById('previewData').style.display = 'block';
            
            const emailCol = document.getElementById('emailColumn').value;
            const nameCol = document.getElementById('nameColumn').value;
            
            let validCount = 0;
            let invalidCount = 0;
            const previewRows = [];
            
            uploadedData.slice(0, 10).forEach(row => {
                const email = row[emailCol] || '';
                const name = nameCol ? (row[nameCol] || '') : '';
                const isValid = email.includes('@') && email.includes('.');
                
                if (isValid) validCount++;
                else invalidCount++;
                
                previewRows.push({ email, name, isValid });
            });
            
            uploadedData.forEach(row => {
                const email = row[emailCol] || '';
                if (!email.includes('@') || !email.includes('.')) {
                    invalidCount++;
                }
            });
            validCount = uploadedData.length - invalidCount;
            
            document.getElementById('previewValidCount').textContent = validCount;
            document.getElementById('previewInvalidCount').textContent = invalidCount;
            
            const tbody = document.getElementById('previewTableBody');
            tbody.innerHTML = previewRows.map(row => `
                <tr>
                    <td>${row.email}</td>
                    <td>${row.name}</td>
                    <td><span class="status-badge ${row.isValid ? 'status-valid' : 'status-invalid'}">${row.isValid ? 'Valid' : 'Invalid'}</span></td>
                </tr>
            `).join('');
        }
        
        async function createGroupFromUpload() {
            const emailCol = document.getElementById('emailColumn').value;
            const nameCol = document.getElementById('nameColumn').value;
            const groupName = document.getElementById('uploadGroupName').value.trim();
            const groupDesc = document.getElementById('uploadGroupDesc').value.trim();

            if (!emailCol) { alert('Please select the email column'); return; }
            if (!groupName) { alert('Please enter a group name'); return; }

            const emailsData = [];
            uploadedData.forEach(row => {
                const email = row[emailCol] ? row[emailCol].trim() : '';
                const name = nameCol ? (row[nameCol] ? row[nameCol].trim() : '') : '';
                if (email && email.includes('@') && email.includes('.')) {
                    emailsData.push({ email, name });
                }
            });

            if (emailsData.length === 0) { alert('No valid emails found'); return; }

            const btn = document.querySelector('[onclick="createGroupFromUpload()"]');
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

            try {
                const data = await apiCall('/groups', 'POST', {
                    name: groupName,
                    description: groupDesc,
                    emails: emailsData.map(e => e.email),
                    names: emailsData.map(e => e.name)
                }, true);

                document.getElementById('uploadGroupName').value = '';
                document.getElementById('uploadGroupDesc').value = '';
                document.getElementById('fileInput').value = '';
                document.getElementById('fileInfo').classList.remove('show');
                document.getElementById('previewEmpty').style.display = 'block';
                document.getElementById('previewData').style.display = 'none';
                uploadedData = [];
                loadDashboardData();
                alert('✓ ' + data.message);
            } catch(err) {
                alert('Failed to create group: ' + err.message);
            } finally {
                if (btn) { btn.textContent = 'Create Group from Upload'; btn.disabled = false; }
            }
        }
        
        async function updateGroupDropdown() {
            const select = document.getElementById('selectGroup');
            select.innerHTML = '<option value="">Loading groups...</option>';
            try {
                const data = await apiCall('/groups', 'GET', null, true);
                groups = data.groups;
                select.innerHTML = '<option value="">Choose a group...</option>' +
                    groups.map(g => `<option value="${g._id}">${g.name} (${g.recipientCount} recipients)</option>`).join('');
            } catch(err) {
                select.innerHTML = '<option value="">Failed to load groups</option>';
            }
        }
        
        function updateGroupPreview() {
            const idx = document.getElementById('selectGroup').value;
            const previewDiv = document.getElementById('previewRecipients');
            const subjectDiv = document.getElementById('previewSubject');
            const bodyDiv = document.getElementById('previewBody');
            const timeDiv = document.getElementById('estimatedTime');
            
            if (!idx) {
                previewDiv.textContent = 'No group selected';
                subjectDiv.textContent = '-';
                bodyDiv.textContent = '-';
                timeDiv.textContent = '-';
                return;
            }
            
            const group = groups.find(g => g._id === idx) || groups[idx];
            const subject = document.getElementById('emailSubject').value || '(no subject)';
            const body = document.getElementById('emailBody').value || '(empty)';
            const delay = parseInt(document.getElementById('sendDelay').value) || 2;
            const totalSecs = (group.recipientCount || 0) * delay;
            const mins = Math.ceil(totalSecs / 60);
            
            previewDiv.textContent = group.name + ' (' + group.recipientCount + ' recipients)';
            subjectDiv.textContent = subject;
            bodyDiv.textContent = body;
            timeDiv.textContent = mins + ' minute(s)';

            // Update attachments preview
            const attachPreview = document.getElementById('previewAttachments');
            if (attachPreview) {
                if (attachedFiles.length === 0) {
                    attachPreview.textContent = 'None';
                } else {
                    attachPreview.textContent = attachedFiles.map(f => f.name).join(', ');
                }
            }
        }
        
        document.getElementById('selectGroup').addEventListener('change', updateGroupPreview);
        document.getElementById('emailSubject').addEventListener('input', updateGroupPreview);
        document.getElementById('emailBody').addEventListener('input', updateGroupPreview);
        document.getElementById('sendDelay').addEventListener('input', updateGroupPreview);

        // ─── Attachment Logic ───────────────────────────────────────────
        let attachedFiles = [];
        const MAX_FILES = 5;
        const MAX_SIZE_MB = 100;

        function getFileIcon(name) {
            const ext = name.split('.').pop().toLowerCase();
            const icons = { pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',csv:'📋',txt:'📃',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',zip:'🗜️',ppt:'📑',pptx:'📑' };
            return icons[ext] || '📎';
        }

        function formatSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function handleAttachmentDragOver(e) {
            e.preventDefault();
            document.getElementById('attachmentZone').classList.add('dragover');
        }

        function handleAttachmentDragLeave(e) {
            e.preventDefault();
            document.getElementById('attachmentZone').classList.remove('dragover');
        }

        function handleAttachmentDrop(e) {
            e.preventDefault();
            document.getElementById('attachmentZone').classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) processAttachments(e.dataTransfer.files);
        }

        function handleAttachmentSelect(e) {
            processAttachments(e.target.files);
            document.getElementById('attachmentInput').value = '';
        }

        function processAttachments(files) {
            for (const file of files) {
                if (attachedFiles.length >= MAX_FILES) { alert('Maximum ' + MAX_FILES + ' files allowed.'); break; }
                if (file.size > MAX_SIZE_MB * 1024 * 1024) { alert('"' + file.name + '" exceeds 100 MB limit and was skipped.'); continue; }
                if (attachedFiles.some(f => f.name === file.name && f.size === file.size)) { alert('"' + file.name + '" is already attached.'); continue; }
                attachedFiles.push(file);
            }
            renderAttachmentList();
            updateGroupPreview();
        }

        function removeAttachment(index) {
            attachedFiles.splice(index, 1);
            renderAttachmentList();
            updateGroupPreview();
        }

        function clearAllAttachments() {
            attachedFiles = [];
            renderAttachmentList();
            updateGroupPreview();
        }

        function renderAttachmentList() {
            const list = document.getElementById('attachmentList');
            const summary = document.getElementById('attachmentSummary');
            if (attachedFiles.length === 0) { list.innerHTML = ''; summary.style.display = 'none'; return; }
            list.innerHTML = attachedFiles.map((file, i) => `
                <div class="attachment-item">
                    <div class="attachment-item-icon">${getFileIcon(file.name)}</div>
                    <div class="attachment-item-info">
                        <div class="attachment-item-name" title="${file.name}">${file.name}</div>
                        <div class="attachment-item-size">${formatSize(file.size)}</div>
                    </div>
                    <button class="attachment-remove-btn" onclick="removeAttachment(${i})" title="Remove">✕</button>
                </div>
            `).join('');
            const totalSize = attachedFiles.reduce((sum, f) => sum + f.size, 0);
            document.getElementById('attachmentCountText').textContent = attachedFiles.length + ' file(s) attached';
            document.getElementById('attachmentSizeText').textContent = formatSize(totalSize) + ' total';
            summary.style.display = 'flex';
        }
        
        async function sendEmail() {
            const idx = document.getElementById('selectGroup').value;
            const campaignName = document.getElementById('campaignName').value.trim();
            const subject = document.getElementById('emailSubject').value.trim();
            const body = document.getElementById('emailBody').value.trim();

            if (!idx) { alert('Please select a recipient group'); return; }
            if (!subject) { alert('Please enter an email subject'); return; }
            if (!body) { alert('Please write the email body'); return; }

            const group = groups.find(g => g._id === idx) || groups[idx];
            const totalRecipients = group ? group.recipientCount : 0;

            const confirmed = confirm(
                'CONFIRM SEND CAMPAIGN\n\n' +
                'Group: ' + (group ? group.name : idx) + '\n' +
                'Recipients: ' + totalRecipients + '\n' +
                'Subject: ' + subject + '\n\n' +
                'Emails will be sent from trugydexcompliance@gmail.com\n' +
                'Estimated time: ' + Math.ceil(totalRecipients * 2 / 60) + ' minute(s)\n\n' +
                'Are you sure you want to send?'
            );
            if (!confirmed) return;

            const btn = document.querySelector('[onclick="sendEmail()"]');
            if (btn) { btn.innerHTML = '&#9203; Sending emails... please wait'; btn.disabled = true; btn.style.background = '#f59e0b'; }

            // Show progress bar
            let progressDiv = document.getElementById('sendProgress');
            if (!progressDiv) {
                progressDiv = document.createElement('div');
                progressDiv.id = 'sendProgress';
                progressDiv.style.cssText = 'margin-top:1rem;padding:1rem;background:#eff6ff;border-radius:8px;border-left:4px solid #003087;font-size:13px;';
                btn.parentNode.insertBefore(progressDiv, btn.nextSibling);
            }
            progressDiv.innerHTML = '&#128231; Sending emails to ' + totalRecipients + ' recipients...<br><small>Do not close this window. This may take a few minutes.</small>';
            progressDiv.style.display = 'block';

            try {
                // Build signature HTML
                // Read from editable signature fields
                var sigName    = document.getElementById('sigName') ? document.getElementById('sigName').value : 'Trugydex Compliance';
                var sigTitle   = document.getElementById('sigTitle') ? document.getElementById('sigTitle').value : 'SAHI SALAH SUCHAN';
                var sigEmail   = document.getElementById('sigEmail') ? document.getElementById('sigEmail').value : 'trugydexcompliance@gmail.com';
                var sigWebsite = document.getElementById('sigWebsite') ? document.getElementById('sigWebsite').value : 'www.trugydex.in';
                var sigPhone   = document.getElementById('sigPhone') ? document.getElementById('sigPhone').value : '';

                var signatureHtml = '<br><br>' +
                    '<table style="width:100%;border-top:2px solid #003087;padding-top:12px;margin-top:16px;">' +
                    '<tr>' +
                    '<td style="vertical-align:middle;padding-right:16px;width:130px;">' +
                    '<img src="https://mail.trugydex.in/logo.png" alt="Trugydex" style="width:120px;height:auto;display:block;" />' +
                    '</td>' +
                    '<td style="vertical-align:middle;border-left:2px solid #e0e0e0;padding-left:16px;">' +
                    '<p style="margin:0;font-size:14px;font-weight:700;color:#003087;">' + sigName + '</p>' +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigTitle + '</p>' +
                    (sigPhone ? '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigPhone + '</p>' : '') +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigEmail + '</p>' +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigWebsite + '</p>' +
                    '</td></tr></table>' +
                    '<p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px;">&copy; 2026 Trugydex. All rights reserved.</p>';

                // Auto prepend Dear {name} - replaced per recipient by server
                var finalBody = 'Dear {name},<br><br>' + body.replace(/\n/g, '<br>');

                // Convert attachments to base64
                const attachmentData = [];
                for (const file of attachedFiles) {
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
                        reader.readAsDataURL(file);
                    });
                    attachmentData.push({
                        filename: file.name,
                        content: base64,
                        contentType: file.type || 'application/octet-stream'
                    });
                }
                
                // Show sending progress
                progressDiv.innerHTML = '⏳ Queueing ' + groupPreviewCount + ' emails...';
                progressDiv.style.background = '#eff6ff';
                progressDiv.style.borderColor = '#003087';
                progressDiv.style.display = 'block';

                const data = await apiCall('/email/send', 'POST', {
                    groupId: idx,
                    subject,
                    body: finalBody + signatureHtml,
                    campaignName: campaignName || 'Untitled Campaign',
                    attachments: attachmentData
                }, true);

                // Success response
                progressDiv.style.background = '#f0fdf4';
                progressDiv.style.borderColor = '#2E7D32';
                progressDiv.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 24px; margin-bottom: 10px;">✓</div>
                        <strong>${data.message}</strong><br>
                        <small style="color: var(--text-secondary); margin-top: 8px; display: block;">
                            Campaign ID: ${data.campaignId}<br>
                            ${data.totalEmails} emails queued for sending
                        </small>
                    </div>
                `;

                if (btn) { btn.innerHTML = 'Send Campaign'; btn.disabled = false; btn.style.background = ''; }

                setTimeout(() => {
                    document.getElementById('selectGroup').value = '';
                    document.getElementById('campaignName').value = '';
                    document.getElementById('emailSubject').value = '';
                    document.getElementById('emailBody').value = '';
                    document.getElementById('sendDelay').value = '2';
                    attachedFiles = [];
                    renderAttachmentList();
                    updateGroupPreview();
                    loadDashboardData();
                    if (progressDiv) progressDiv.style.display = 'none';
                    switchTab('history');
                }, 3000);

            } catch(err) {
                progressDiv.style.background = '#fef2f2';
                progressDiv.style.borderColor = '#ef4444';
                progressDiv.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 24px; margin-bottom: 10px;">✗</div>
                        <strong>Campaign Failed</strong><br>
                        <small style="color: var(--text-secondary); margin-top: 8px; display: block;">
                            ${err.message}
                        </small>
                    </div>
                `;
                if (btn) { btn.innerHTML = 'Send Campaign'; btn.disabled = false; btn.style.background = ''; }
            }
        }
        
        function updateDashboard() { loadDashboardData(); }

        async function loadDashboardData() {
            try {
                // Load stats
                const statsData = await apiCall('/campaigns/stats', 'GET', null, true);
                document.getElementById('totalGroups').textContent = statsData.stats.totalGroups;
                document.getElementById('totalRecipients').textContent = statsData.stats.totalRecipients;
                document.getElementById('emailsSent').textContent = statsData.stats.totalCampaigns;

                // Load recent groups
                const groupData = await apiCall('/groups', 'GET', null, true);
                groups = groupData.groups;
                const activity = document.getElementById('recentActivity');
                if (groups.length === 0) {
                    activity.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px;">No groups created yet. Upload emails to get started!</p>';
                } else {
                    activity.innerHTML = groups.slice(0, 5).map(g => `
                        <div class="recent-item">
                            <strong>${g.name}</strong>
                            <p>${g.recipientCount} recipients &bull; ${new Date(g.createdAt).toLocaleDateString()}</p>
                        </div>
                    `).join('');
                }

                // Load campaign history
                const campData = await apiCall('/campaigns', 'GET', null, true);
                campaigns = campData.campaigns;
                const history = document.getElementById('campaignHistory');
                if (campaigns.length === 0) {
                } else {
                    history.innerHTML = campaigns.map(c => `
                        <div class="recent-item">
                            <strong>${c.name}</strong>
                            <p>📧 Subject: ${c.subject}</p>
                            <p>👥 Group: ${c.groupName} &bull; ${c.recipientCount} recipients</p>
                            <p>📎 Attachments: ${c.attachments && c.attachments.length > 0 ? c.attachments.join(', ') : 'None'}</p>
                            <p>🕐 Sent: ${new Date(c.sentAt).toLocaleString()}</p>
                        </div>
                    `).join('');
                }

                if (currentUser && currentUser.role === 'Administrator') {
                    try {
                        const userData = await apiCall('/users', 'GET', null, true);
                        updatePendingBadgeCount(userData.stats.pending);
                    } catch(e) {}
                }
            } catch(err) {
                console.error('Dashboard load error:', err.message);
            }
        }

        function updateSignaturePreview() {
            var name    = document.getElementById('sigName') ? document.getElementById('sigName').value : '';
            var title   = document.getElementById('sigTitle') ? document.getElementById('sigTitle').value : '';
            var email   = document.getElementById('sigEmail') ? document.getElementById('sigEmail').value : '';
            var website = document.getElementById('sigWebsite') ? document.getElementById('sigWebsite').value : '';
            var phone   = document.getElementById('sigPhone') ? document.getElementById('sigPhone').value : '';
            var preview = document.getElementById('sigPreviewName');
            if (preview) preview.textContent = name;
            var pt = document.getElementById('sigPreviewTitle');
            if (pt) pt.textContent = title;
            var pe = document.getElementById('sigPreviewEmail');
            if (pe) pe.textContent = email;
            var pw = document.getElementById('sigPreviewWebsite');
            if (pw) pw.textContent = website;
            var pp = document.getElementById('sigPreviewPhone');
            if (pp) { pp.textContent = phone; pp.style.display = phone ? 'block' : 'none'; }
        }

        function downloadSampleCSV() {
            const csvContent = "Email,Name\njay@gmail.com,Jay\nsweetu@gmail.com,Sweetu\nsamir@gmail.com,Samir\nclient@company.com,Client Name\n";
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'trugydex_sample_emails.csv';
            a.click();
            URL.revokeObjectURL(url);
        }

        // ────────────────────────────────────────────────────────────────
        // GROUP MANAGEMENT FUNCTIONS
        // ────────────────────────────────────────────────────────────────

        let currentEditingGroupId = null;
        let currentEditingGroupEmails = [];

        async function loadAllGroups() {
            try {
                const data = await apiCall('/groups', 'GET', null, true);
                const tbody = document.getElementById('groupsTableBody');
                
                if (data.groups.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-secondary);">No groups created yet</td></tr>';
                    return;
                }

                tbody.innerHTML = data.groups.map(group => `
                    <tr>
                        <td style="font-weight:600;color:var(--primary-blue);">${group.name}</td>
                        <td>${group.description || '<span style="color:var(--text-secondary);">No description</span>'}</td>
                        <td style="text-align:center;"><span style="background:var(--light-blue);padding:4px 10px;border-radius:4px;font-weight:600;font-size:12px;">${group.recipientCount}</span></td>
                        <td style="text-align:center;">
                            <button onclick="openEditModal('${group._id}')" style="background:#e0f2fe;color:#0369a1;border:none;padding:6px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px;">✏️ Edit</button>
                            <button onclick="deleteGroup('${group._id}')" style="background:#fee2e2;color:#dc2626;border:none;padding:6px 12px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">🗑️ Delete</button>
                        </td>
                    </tr>
                `).join('');
            } catch (err) {
                alert('Failed to load groups: ' + err.message);
            }
        }

        async function openEditModal(groupId) {
            try {
                // Fetch full group details with emails
                const response = await fetch(API_BASE + '/groups/' + groupId, {
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('tg_token') }
                });
                const data = await response.json();
                
                if (!data.success) {
                    alert('Failed to load group details');
                    return;
                }

                const group = data.group;
                currentEditingGroupId = groupId;
                currentEditingGroupEmails = group.emails || [];

                // Populate form
                document.getElementById('editGroupName').value = group.name;
                document.getElementById('editGroupDesc').value = group.description || '';
                document.getElementById('currentEmailCount').textContent = currentEditingGroupEmails.length;

                // Display emails
                renderCurrentEmails();

                // Reset form
                document.getElementById('addEmailForm').style.display = 'none';
                document.getElementById('newEmail').value = '';
                document.getElementById('newEmailName').value = '';

                // Show modal
                document.getElementById('editGroupModal').style.display = 'flex';
            } catch (err) {
                alert('Error loading group: ' + err.message);
            }
        }

        function renderCurrentEmails() {
            const emailsList = document.getElementById('currentEmailsList');
            if (currentEditingGroupEmails.length === 0) {
                emailsList.innerHTML = '<p style="color:var(--text-secondary);">No emails in this group</p>';
                return;
            }

            emailsList.innerHTML = currentEditingGroupEmails.map((email, index) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;margin-bottom:6px;background:white;border-radius:6px;border:1px solid var(--border-color);">
                    <span>${email}</span>
                    <button onclick="removeEmailFromGroup(${index})" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:0;">✕</button>
                </div>
            `).join('');
        }

        function toggleAddEmailForm() {
            const form = document.getElementById('addEmailForm');
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
            if (form.style.display === 'block') {
                document.getElementById('newEmail').focus();
            }
        }

        async function addEmailToGroup() {
            const email = document.getElementById('newEmail').value.trim();
            
            if (!email) {
                alert('Please enter an email address');
                return;
            }

            if (!email.includes('@') || !email.includes('.')) {
                alert('Please enter a valid email address');
                return;
            }

            if (currentEditingGroupEmails.includes(email)) {
                alert('This email is already in the group');
                return;
            }

            currentEditingGroupEmails.push(email);
            document.getElementById('newEmail').value = '';
            document.getElementById('newEmailName').value = '';
            document.getElementById('currentEmailCount').textContent = currentEditingGroupEmails.length;
            renderCurrentEmails();
            toggleAddEmailForm();
        }

        function removeEmailFromGroup(index) {
            if (confirm('Remove this email from the group?')) {
                currentEditingGroupEmails.splice(index, 1);
                document.getElementById('currentEmailCount').textContent = currentEditingGroupEmails.length;
                renderCurrentEmails();
            }
        }

        async function saveGroupChanges() {
            const name = document.getElementById('editGroupName').value.trim();
            const description = document.getElementById('editGroupDesc').value.trim();

            if (!name) {
                alert('Please enter a group name');
                return;
            }

            if (currentEditingGroupEmails.length === 0) {
                alert('Group must have at least one email');
                return;
            }

            const btn = event.target;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            try {
                const response = await apiCall('/groups/' + currentEditingGroupId, 'PUT', {
                    name,
                    description,
                    emails: currentEditingGroupEmails
                }, true);

                alert('✓ Group updated successfully');
                closeEditModal();
                loadAllGroups();
            } catch (err) {
                alert('Failed to update group: ' + err.message);
            } finally {
                btn.textContent = 'Save Changes';
                btn.disabled = false;
            }
        }

        function closeEditModal() {
            document.getElementById('editGroupModal').style.display = 'none';
            currentEditingGroupId = null;
            currentEditingGroupEmails = [];
        }

        async function deleteGroup(groupId) {
            if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
                return;
            }

            try {
                const response = await apiCall('/groups/' + groupId, 'DELETE', null, true);
                alert('✓ Group deleted successfully');
                loadAllGroups();
            } catch (err) {
                alert('Failed to delete group: ' + err.message);
            }
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('editGroupModal');
            if (modal && event.target === modal) {
                closeEditModal();
            }
        }