
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
        const API_BASE = 'https://mail.trugydex.in/api';

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
        
        function switchTab(tab) {
            document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
            if (tab === 'compose') updateGroupDropdown();
            if (tab === 'userlog') renderUserLog();
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
        const MAX_SIZE_MB = 10;

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
                if (file.size > MAX_SIZE_MB * 1024 * 1024) { alert('"' + file.name + '" exceeds 10 MB limit and was skipped.'); continue; }
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
                    '<img src="data:image/png;base64,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" alt="Trugydex" style="width:120px;height:auto;display:block;" />' +
                    '</td>' +
                    '<td style="vertical-align:middle;border-left:2px solid #e0e0e0;padding-left:16px;">' +
                    '<p style="margin:0;font-size:14px;font-weight:700;color:#003087;">' + sigName + '</p>' +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigTitle + '</p>' +
                    (sigPhone ? '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigPhone + '</p>' : '') +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigEmail + '</p>' +
                    '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + sigWebsite + '</p>' +
                    '</td></tr></table>' +
                    '<p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px;">&copy; 2026 Trugydex. All rights reserved.</p>';

                const data = await apiCall('/email/send', 'POST', {
                    groupId: idx,
                    subject,
                    body: body + signatureHtml,
                    campaignName: campaignName || 'Untitled Campaign'
                }, true);

                progressDiv.style.background = '#f0fdf4';
                progressDiv.style.borderColor = '#2E7D32';
                progressDiv.innerHTML = '&#10003; ' + data.message;

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
                progressDiv.innerHTML = '&#10060; Failed: ' + err.message;
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