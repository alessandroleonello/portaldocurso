/**
 * Portal do Curso - Multi-Escola Management Engine
 * Firebase Firestore Connection Mode
 */

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, getDocs, getDoc, setDoc, doc, deleteDoc, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// Modular Architecture Services & Modules
import { firebaseService } from './src/services/firebase-service.js';
import { storageService } from './src/services/storage-service.js';
import { NoticeModule } from './src/modules/notices.js';
import { DocumentModule } from './src/modules/documents.js';
import { LessonModule } from './src/modules/lessons.js';
import { StudentModule } from './src/modules/student.js';
import { FinancialModule } from './src/modules/financial.js';
import { GradeModule } from './src/modules/grades.js';
import { UsersModule } from './src/modules/users.js';
import { AcademicReportsModule } from './src/modules/academicReports.js';
import { NotificationsModule } from './src/modules/notifications.js';
import { AcademicCalendarModule } from './src/modules/academicCalendar.js';
import { PdfService } from './src/services/pdf-service.js';

class PortalApp {
  constructor() {
    window.app = this;
    this.currentUser = JSON.parse(localStorage.getItem('portal_current_user')) || null;
    this.isLoggedIn = !!this.currentUser;
    this.currentRole = this.currentUser ? (this.currentUser.tipo || 'gestao') : 'gestao';
    this.activeTab = 'tab-dashboard';
    this.selectedTurmasCourseId = 'todos';
    this.selectedScheduleCourseId = 'todos';
    this.selectedScheduleTurmaId = 'todas';
    this.selectedCurriculumCourseId = 'todos';
    this.selectedCurriculumDisciplineId = 'todas';
    this.selectedLessonCourseId = null;
    this.selectedLessonTurmaId = null;
    this.selectedGradeCourseId = null;
    this.selectedGradeTurmaId = null;
    this.selectedBiblioCourseId = 'todos';
    this.selectedBiblioDisciplineId = 'todas';
    this.scheduleViewMode = 'grid';
    this.selectedStudentDisciplineId = null;
    this.studentDiscActiveSection = null;
    
    // Services and Domain Modules
    this.storageService = storageService;
    this.firebaseService = firebaseService;
    this.noticeModule = new NoticeModule(this);
    this.documentModule = new DocumentModule(this);
    this.lessonModule = new LessonModule(this);
    this.studentModule = new StudentModule(this);
    this.financialModule = new FinancialModule(this);
    this.gradeModule = new GradeModule(this);
    this.usersModule = new UsersModule(this);
    this.academicReportsModule = new AcademicReportsModule(this);
    this.notificationsModule = new NotificationsModule(this);
    this.calendarModule = new AcademicCalendarModule(this);
    this.pdfService = new PdfService(this);
    this.deferredPwaPrompt = null;

    // State Collections
    this.state = this.storageService.createInitialState();

    this.initFirebase();
    this.init();
  }

  initFirebase() {
    try {
      if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "SUA_API_KEY_AQUI") {
        this.firebaseApp = initializeApp(firebaseConfig);
        this.db = getFirestore(this.firebaseApp);
        this.auth = getAuth(this.firebaseApp);
        this.firebaseService.init(this.db);
        this.isFirebaseActive = true;
        console.log('🔥 Firebase Firestore & Auth Conectados com Sucesso:', firebaseConfig.projectId);
      } else {
        this.isFirebaseActive = false;
        console.warn('⚠️ Firebase: Insira suas chaves no arquivo firebase-config.js para conectar ao Firestore.');
      }
    } catch (e) {
      console.error('Erro ao inicializar o Firebase:', e);
      this.isFirebaseActive = false;
    }
  }

  async createUserInFirebaseAuth(email, password) {
    if (!this.isFirebaseActive) return null;
    if (!email || !password) return null;

    let validPassword = String(password);
    if (validPassword.length < 6) {
      validPassword = validPassword.padEnd(6, '0');
    }

    try {
      const tempAppName = 'SecondaryAuth_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const secondaryApp = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), validPassword);
      console.log('✅ Usuário registrado no Firebase Authentication com sucesso:', userCredential.user.email, userCredential.user.uid);
      return userCredential.user;
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        console.log('ℹ️ Usuário já existe no Firebase Authentication:', email);
      } else if (err.code === 'auth/operation-not-allowed') {
        console.warn('⚠️ Firebase Authentication: Ative o provedor "E-mail/senha" no Firebase Console em Authentication -> Sign-in method.');
      } else {
        console.warn('Aviso Firebase Authentication:', err.code, err.message);
      }
      return null;
    }
  }

  async loadSchoolsFromFirestore() {
    if (!this.isFirebaseActive || !this.db) return;
    try {
      const snap = await getDocs(collection(this.db, 'escolas'));
      if (!snap.empty) {
        if (!this.state.schools) this.state.schools = [];
        snap.forEach(d => {
          const sch = d.data();
          const idx = this.state.schools.findIndex(s => s.id === sch.id);
          if (idx >= 0) this.state.schools[idx] = sch;
          else this.state.schools.push(sch);
        });
        this.saveStateLocally();
        this.renderSidebarSchool();
      }
    } catch (e) {
      console.warn('Aviso: Leitura inicial de escolas no Firestore:', e);
    }
  }

  init() {
    this.loadState();
    this.purgeFictionalData();
    this.seedDefaultDataIfNeeded();
    this.syncCourseDisciplinesToCurriculum();
    this.applyThemeFromStorage();
    this.checkAuthStatus();
    if (this.isLoggedIn) {
      this.setRole(this.currentRole);
      
      const roleAllowedTabs = {
        gestao: [
          'tab-dashboard', 'tab-calendario', 'tab-escolas', 'tab-usuarios', 'tab-cursos', 'tab-disciplinas',
          'tab-turmas', 'tab-financeiro', 'tab-aulas', 'tab-frequencia', 'tab-notas',
          'tab-bibliografia', 'tab-horarios', 'tab-matriz', 'tab-documentos'
        ],
        secretaria: [
          'tab-dashboard', 'tab-calendario', 'tab-usuarios', 'tab-cursos', 'tab-disciplinas', 'tab-turmas',
          'tab-financeiro', 'tab-frequencia', 'tab-horarios', 'tab-documentos'
        ],
        professor: [
          'tab-dashboard', 'tab-calendario', 'tab-turmas', 'tab-aulas', 'tab-frequencia', 'tab-notas',
          'tab-bibliografia', 'tab-horarios', 'tab-matriz'
        ],
        aluno: [
          'tab-dashboard', 'tab-calendario', 'tab-meu-curso', 'tab-financeiro', 'tab-horarios', 'tab-matriz', 'tab-documentos'
        ]
      };

      const savedTab = localStorage.getItem('portal_active_tab') || 'tab-dashboard';
      const allowedList = roleAllowedTabs[this.currentRole] || ['tab-dashboard'];

      let targetTab = 'tab-dashboard';
      if (savedTab && document.getElementById(savedTab)) {
        if (allowedList.includes(savedTab)) {
          targetTab = savedTab;
        } else {
          // Fallback dinâmico: verificar se há algum link de navegação visível para o perfil
          const navItems = Array.from(document.querySelectorAll(`.nav-item[data-tab="${savedTab}"]`));
          if (navItems.length > 0 && navItems.some(el => el.style.display !== 'none')) {
            targetTab = savedTab;
          }
        }
      }

      this.switchTab(targetTab);
    }
    this.render();
    this.restoreSidebarSections();
    this.setupEventListeners();
    this.loadSchoolsFromFirestore();

    // PWA Service Worker Registration & Install Prompt Capture
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          console.log('📱 [PWA] Service Worker ativo:', reg.scope);
        }).catch(err => {
          console.log('⚠️ [PWA] Falha ao registrar Service Worker:', err);
        });
      });
    }

    // PWA Install Prompt Event Listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      const btnInstall = document.getElementById('btn-pwa-install');
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPwaPrompt = null;
      const btnInstall = document.getElementById('btn-pwa-install');
      if (btnInstall) {
        btnInstall.style.display = 'none';
      }
      this.showToast('Aplicativo instalado com sucesso na sua tela inicial!', 'success');
    });

    // Fechar dropdown de notificações ao clicar fora
    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('notification-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        if (this.notificationsModule) {
          this.notificationsModule.closeDropdown();
        }
      }
    });

    // Auto-check URL query for Document / Student Card Verification (via QR Code)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const verifyCode = urlParams.get('verify') || urlParams.get('auth');
      if (verifyCode) {
        setTimeout(() => {
          this.openVerifyDocumentModal(verifyCode);
        }, 600);
      }
    } catch (e) {
      console.warn('Erro ao processar verificação via URL:', e);
    }
  }

  /* --- Sanitize & Security Helpers --- */
  escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* --- UI Notification & Confirmation Helpers --- */
  showToast(message, type = 'info', title = null, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.log(`[Toast ${type}]`, message);
      return;
    }

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };

    const defaultTitles = {
      success: 'Sucesso',
      error: 'Atenção / Erro',
      warning: 'Aviso',
      info: 'Notificação'
    };

    const toast = document.createElement('div');
    toast.className = `toast-card toast-${type}`;

    const iconClass = icons[type] || icons.info;
    const finalTitle = title || defaultTitles[type] || 'Notificação';

    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
      <div class="toast-content">
        <div class="toast-title">${this.escapeHTML(finalTitle)}</div>
        <div class="toast-message">${this.escapeHTML(message)}</div>
      </div>
      <button type="button" class="toast-close" title="Fechar">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      if (toast.classList.contains('toast-hiding')) return;
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    if (closeBtn) closeBtn.addEventListener('click', dismiss);

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  showToastWithUndo(message, onUndo, duration = 6500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-card toast-warning toast-with-undo';

    let undone = false;
    let timer = null;

    toast.innerHTML = `
      <div class="toast-icon" style="color: #ef4444;"><i class="fa-solid fa-trash-can"></i></div>
      <div class="toast-content" style="flex: 1;">
        <div class="toast-title">Registro Removido</div>
        <div class="toast-message">${this.escapeHTML(message)}</div>
      </div>
      <button type="button" class="btn btn-sm btn-undo-action" style="padding: 4px 10px; font-weight: 700; border-radius: 999px; margin-right: 6px;">
        <i class="fa-solid fa-rotate-left"></i> Desfazer
      </button>
      <button type="button" class="toast-close" title="Fechar">&times;</button>
    `;

    const dismiss = () => {
      if (toast.classList.contains('toast-hiding')) return;
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    const undoBtn = toast.querySelector('.btn-undo-action');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (!undone && typeof onUndo === 'function') {
          undone = true;
          clearTimeout(timer);
          onUndo();
          dismiss();
          this.showToast('Operação desfeita com sucesso!', 'success');
        }
      });
    }

    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) closeBtn.addEventListener('click', dismiss);

    container.appendChild(toast);
    timer = setTimeout(dismiss, duration);
  }

  confirmAction({
    title = 'Confirmar Ação',
    message = 'Deseja realmente continuar com esta operação?',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger'
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('modal-confirm-title');
      const messageEl = document.getElementById('modal-confirm-message');
      const iconWrap = document.getElementById('modal-confirm-icon-wrap');
      const iconEl = document.getElementById('modal-confirm-icon');
      const btnCancel = document.getElementById('modal-confirm-btn-cancel');
      const btnOk = document.getElementById('modal-confirm-btn-ok');

      if (!modal) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;
      if (btnCancel) btnCancel.textContent = cancelText;
      if (btnOk) {
        btnOk.textContent = confirmText;
        btnOk.className = `btn btn-${type === 'warning' ? 'warning' : type === 'primary' ? 'primary' : 'danger'}`;
      }

      if (iconWrap && iconEl) {
        iconWrap.className = `modal-confirm-icon-wrap ${type}`;
        if (type === 'danger') {
          iconEl.className = 'fa-solid fa-triangle-exclamation';
        } else if (type === 'warning') {
          iconEl.className = 'fa-solid fa-circle-exclamation';
        } else {
          iconEl.className = 'fa-solid fa-circle-question';
        }
      }

      modal.classList.add('open');

      const cleanup = (result) => {
        modal.classList.remove('open');
        btnCancel.removeEventListener('click', onCancel);
        btnOk.removeEventListener('click', onOk);
        modal.removeEventListener('click', onOverlayClick);
        resolve(result);
      };

      const onCancel = () => cleanup(false);
      const onOk = () => cleanup(true);
      const onOverlayClick = (e) => {
        if (e.target === modal) cleanup(false);
      };

      btnCancel.addEventListener('click', onCancel);
      btnOk.addEventListener('click', onOk);
      modal.addEventListener('click', onOverlayClick);
    });
  }

  confirmDialog(options) {
    return this.confirmAction(options);
  }

  checkPermission(allowedRoles, actionName = null) {
    if (!allowedRoles.includes(this.currentRole)) {
      if (actionName) {
        this.showToast(`O perfil "${this.currentRole.toUpperCase()}" não possui permissão para ${actionName}.`, 'error', 'Acesso Negado');
      }
      return false;
    }
    return true;
  }

  hasRole(...roles) {
    const list = roles.flat();
    return list.includes(this.currentRole);
  }

  generateUniqueId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /* =========================================================================
     1. STORAGE & SEEDING (Local & Firebase Support)
     ========================================================================= */
  loadState() {
    this.state = this.storageService.loadState();
    if (this.state.classes && Array.isArray(this.state.classes)) {
      this.state.classes.forEach(t => this.ensureTurmaDisciplines(t));
      this.syncAllSharedDisciplines();
    }
  }

  ensureTurmaDisciplines(turma) {
    if (!turma) return;
    if (!turma.disciplines || !Array.isArray(turma.disciplines)) {
      turma.disciplines = [];
      if (turma.disciplineId) {
        turma.disciplines.push({
          id: 'td_' + (turma.id || Date.now()) + '_seed',
          disciplineId: turma.disciplineId,
          teacherId: turma.teacherId || null,
          periodo: '2026/1',
          status: 'ativa',
          criadoEm: turma.criadoEm || new Date().toISOString()
        });
      }
    }
  }

  syncAllSharedDisciplines() {
    if (!this.state.classes || !Array.isArray(this.state.classes)) return;

    this.state.classes.forEach(t => this.ensureTurmaDisciplines(t));

    // Propagar vínculos de aula conjunta para que a disciplina exista de forma igualitária em ambas as turmas
    this.state.classes.forEach(turma => {
      (turma.disciplines || []).forEach(td => {
        if (td.status !== 'arquivada' && Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0) {
          td.sharedWithTurmaIds.forEach(targetTurmaId => {
            const targetTurma = this.state.classes.find(t => t.id === targetTurmaId);
            if (targetTurma) {
              this.ensureTurmaDisciplines(targetTurma);
              let targetTd = (targetTurma.disciplines || []).find(d => d.disciplineId === td.disciplineId && d.status !== 'arquivada');
              if (!targetTd) {
                targetTd = {
                  id: 'td_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                  disciplineId: td.disciplineId,
                  teacherId: td.teacherId || null,
                  periodo: td.periodo || 'Atual',
                  status: 'ativa',
                  sharedWithTurmaIds: [turma.id],
                  studentStatuses: {},
                  criadoEm: td.criadoEm || new Date().toISOString()
                };
                targetTurma.disciplines.push(targetTd);
                targetTurma.atualizadoEm = new Date().toISOString();
              } else {
                if (!Array.isArray(targetTd.sharedWithTurmaIds)) targetTd.sharedWithTurmaIds = [];
                if (!targetTd.sharedWithTurmaIds.includes(turma.id)) {
                  targetTd.sharedWithTurmaIds.push(turma.id);
                  targetTurma.atualizadoEm = new Date().toISOString();
                }
                if (td.teacherId && !targetTd.teacherId) targetTd.teacherId = td.teacherId;
                if (td.periodo && !targetTd.periodo) targetTd.periodo = td.periodo;
              }
            }
          });
        }
      });
    });
  }

  getEnrolledStudentsForTurmaDiscipline(turmaId, tdId = null) {
    if (!turmaId) return [];
    if (turmaId.includes('__') && !tdId) {
      const parts = turmaId.split('__');
      turmaId = parts[0];
      tdId = parts[1];
    }
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return [];
    this.ensureTurmaDisciplines(turma);

    const td = tdId && turma.disciplines ? turma.disciplines.find(d => d.id === tdId) : (turma.disciplines && turma.disciplines.length > 0 ? turma.disciplines[0] : null);

    const isEnrolledInTd = (disciplineTd, studentId) => {
      if (!disciplineTd) return true;
      if (disciplineTd.studentStatuses && typeof disciplineTd.studentStatuses === 'object') {
        const st = disciplineTd.studentStatuses[studentId];
        return st === undefined ? true : st === 'matriculado';
      }
      if (Array.isArray(disciplineTd.studentIds)) {
        return disciplineTd.studentIds.includes(studentId);
      }
      return true;
    };

    const enrolledList = [];
    const addedIds = new Set();

    // 1. Base students for this discipline
    (turma.studentIds || []).forEach(sId => {
      if (isEnrolledInTd(td, sId)) {
        const st = this.state.users.find(u => u.id === sId);
        if (st && !addedIds.has(sId)) {
          addedIds.add(sId);
          enrolledList.push({
            ...st,
            originTurmaId: turma.id,
            originTurmaNome: turma.nome,
            isJoint: false
          });
        }
      }
    });

    // 2. Shared students from turmas configured in td.sharedWithTurmaIds
    if (td && Array.isArray(td.sharedWithTurmaIds)) {
      td.sharedWithTurmaIds.forEach(otherTurmaId => {
        const otherTurma = this.state.classes.find(t => t.id === otherTurmaId);
        if (otherTurma) {
          this.ensureTurmaDisciplines(otherTurma);
          const otherTd = (otherTurma.disciplines || []).find(d => d.disciplineId === td.disciplineId && d.status !== 'arquivada');
          (otherTurma.studentIds || []).forEach(sId => {
            if (isEnrolledInTd(otherTd, sId)) {
              const st = this.state.users.find(u => u.id === sId);
              if (st && !addedIds.has(sId)) {
                addedIds.add(sId);
                enrolledList.push({
                  ...st,
                  originTurmaId: otherTurma.id,
                  originTurmaNome: otherTurma.nome,
                  isJoint: true
                });
              }
            }
          });
        }
      });
    }

    // 3. Reverse check: If another turma configured td.sharedWithTurmaIds to include this turma
    if (td) {
      this.state.classes.forEach(otherTurma => {
        if (otherTurma.id !== turma.id) {
          this.ensureTurmaDisciplines(otherTurma);
          const otherTd = (otherTurma.disciplines || []).find(d => 
            d.disciplineId === td.disciplineId && 
            d.status !== 'arquivada' && 
            Array.isArray(d.sharedWithTurmaIds) && 
            d.sharedWithTurmaIds.includes(turma.id)
          );
          if (otherTd) {
            (otherTurma.studentIds || []).forEach(sId => {
              if (isEnrolledInTd(otherTd, sId)) {
                const st = this.state.users.find(u => u.id === sId);
                if (st && !addedIds.has(sId)) {
                  addedIds.add(sId);
                  enrolledList.push({
                    ...st,
                    originTurmaId: otherTurma.id,
                    originTurmaNome: otherTurma.nome,
                    isJoint: true
                  });
                }
              }
            });
          }
        }
      });
    }

    return enrolledList;
  }

  saveState() {
    this.saveStateLocally();
    this.syncWithFirebase();
  }

  saveStateLocally() {
    this.storageService.saveState(this.state);
  }

  purgeFictionalData() {
    const fakeUserIds = new Set(['usr_aluno_1', 'usr_aluno_2', 'usr_dir', 'usr_sec', 'usr_prof_carlos', 'usr_prof_ana']);
    if (this.currentUser) {
      if (fakeUserIds.has(this.currentUser.id) || (this.currentUser.email && this.currentUser.email.includes('@fatech.edu.br'))) {
        this.currentUser = null;
        localStorage.removeItem('portal_current_user');
      }
    }
    const modified = this.storageService.purgeFictionalData(this.state);
    if (modified) {
      this.saveState();
      console.log('🧹 Dados fictícios eliminados com sucesso do sistema.');
    }
  }

  seedDefaultDataIfNeeded() {
    // Não inserir dados fictícios de alunos/turmas. Mantém o sistema limpo para os registros reais da instituição.
    if (!this.state.notices || !Array.isArray(this.state.notices)) {
      this.state.notices = [];
    }
    if (!this.state.issuedDocuments || !Array.isArray(this.state.issuedDocuments)) {
      this.state.issuedDocuments = [];
    }
    if (this.state.notices.length === 0) {
      const activeSchool = this.getActiveSchool();
      this.state.notices.push({
        id: 'not_welcome_01',
        schoolId: activeSchool ? activeSchool.id : null,
        title: 'Boas-vindas ao Portal Acadêmico',
        message: 'Prezados estudantes e docentes, sejam bem-vindos ao novo Portal do Curso. Acompanhem seus diários de classe, frequências, notas e materiais diretamente pela plataforma.',
        category: 'geral',
        target: 'todos',
        authorName: 'Secretaria Acadêmica',
        authorRole: 'secretaria',
        createdAt: new Date().toISOString()
      });
      this.saveState();
    }
  }

  /* =========================================================================
     2. RA GENERATOR ALGORITHM
     ========================================================================= */
  generateNextRA() {
    const currentYear = new Date().getFullYear();
    const activeSchool = this.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;
    const students = this.state.users.filter(u => u.tipo === 'aluno' && u.schoolId === schoolId);
    let maxNum = 0;

    students.forEach(s => {
      if (s.ra && s.ra.startsWith(`RA-${currentYear}-`)) {
        const parts = s.ra.split('-');
        if (parts.length >= 3) {
          const numPart = parseInt(parts[2], 10);
          if (!isNaN(numPart) && numPart > maxNum) {
            maxNum = numPart;
          }
        }
      }
    });

    const nextSeq = String(maxNum + 1).padStart(4, '0');
    return `RA-${currentYear}-${nextSeq}`;
  }

  formatDateBR(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      if (yyyy && mm && dd && yyyy.length === 4) {
        return `${dd}/${mm}/${yyyy}`;
      }
    }
    return dateStr;
  }

  /* =========================================================================
     3. ROLE & TAB SWITCHING LOGIC
     ========================================================================= */
  setRole(role) {
    this.currentRole = role;
    
    // Update role button styling
    ['gestao', 'secretaria', 'professor', 'aluno'].forEach(r => {
      const btn = document.getElementById(`btn-role-${r}`);
      if (btn) {
        if (r === role) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    // Update body dataset for CSS scoping
    document.body.dataset.userRole = role;

    // Update user avatar & title in sidebar
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const nameEl = document.getElementById('sidebar-user-name');
    const badgeEl = document.getElementById('sidebar-user-role-badge');
    const alunoBanner = document.getElementById('aluno-quick-banner');

    const activeUser = this.currentUser || null;
    let userName = activeUser ? activeUser.nome : (role === 'gestao' ? 'Direção Geral' : role === 'secretaria' ? 'Secretaria Acadêmica' : role === 'professor' ? 'Professor' : 'Aluno');
    let initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'US';

    if (role === 'gestao') {
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = userName;
      if (badgeEl) {
        badgeEl.textContent = 'Gestão';
        badgeEl.className = 'user-role-badge role-gestao';
      }
      if (alunoBanner) alunoBanner.style.display = 'none';
    } else if (role === 'secretaria') {
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = userName;
      if (badgeEl) {
        badgeEl.textContent = 'Secretaria';
        badgeEl.className = 'user-role-badge role-secretaria';
      }
      if (alunoBanner) alunoBanner.style.display = 'none';
    } else if (role === 'professor') {
      const activeSchool = this.getActiveSchool();
      const schoolId = activeSchool ? activeSchool.id : null;
      const activeProf = (activeUser && activeUser.tipo === 'professor')
        ? activeUser
        : (this.state.users.find(u => u.tipo === 'professor' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'professor'));
      const profName = activeProf ? activeProf.nome : 'Professor';
      const profInitials = profName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'PR';

      if (avatarEl) avatarEl.textContent = profInitials;
      if (nameEl) nameEl.textContent = profName;
      if (badgeEl) {
        badgeEl.textContent = 'Professor';
        badgeEl.className = 'user-role-badge role-professor';
      }
      if (alunoBanner) alunoBanner.style.display = 'none';
    } else if (role === 'aluno') {
      const activeSchool = this.getActiveSchool();
      const schoolId = activeSchool ? activeSchool.id : null;
      const activeStudent = (activeUser && activeUser.tipo === 'aluno')
        ? activeUser
        : (this.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'aluno'));
      const studentName = activeStudent ? activeStudent.nome : 'Aluno';
      const studentRa = activeStudent ? (activeStudent.ra || '') : '';
      const studentInitials = studentName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'AL';

      if (avatarEl) avatarEl.textContent = studentInitials;
      if (nameEl) nameEl.textContent = studentName;
      if (badgeEl) {
        badgeEl.textContent = studentRa || 'Aluno';
        badgeEl.className = 'user-role-badge role-aluno';
      }

      if (alunoBanner) {
        alunoBanner.style.display = 'block';
        const bannerNome = document.getElementById('banner-aluno-nome');
        const bannerRa = document.getElementById('banner-aluno-ra');
        const bannerCurso = document.getElementById('banner-aluno-curso');
        if (bannerNome) bannerNome.textContent = studentName;
        if (bannerRa) bannerRa.textContent = studentRa || '--';
        const curso = activeStudent ? this.state.courses.find(c => c.id === activeStudent.cursoId) : null;
        if (bannerCurso) bannerCurso.textContent = curso ? curso.name : '';
      }
    }

    this.selectedScheduleCourseId = 'todos';
    this.selectedScheduleTurmaId = 'todas';
    this.selectedCurriculumCourseId = 'todos';
    this.selectedCurriculumDisciplineId = 'todas';
    this.selectedLessonCourseId = null;
    this.selectedLessonTurmaId = null;
    this.selectedGradeCourseId = null;
    this.selectedGradeTurmaId = null;
    this.selectedBiblioCourseId = 'todos';
    this.selectedBiblioDisciplineId = 'todas';

    // Toggle navigation item visibility based on role classes
    this.updateNavVisibility();

    // Se o usuário alternar de perfil e a aba atual não for permitida para o novo perfil, redireciona para a Visão Geral
    const roleAllowedTabs = {
      gestao: [
        'tab-dashboard', 'tab-calendario', 'tab-escolas', 'tab-usuarios', 'tab-cursos', 'tab-disciplinas',
        'tab-turmas', 'tab-financeiro', 'tab-aulas', 'tab-frequencia', 'tab-notas',
        'tab-bibliografia', 'tab-horarios', 'tab-matriz', 'tab-documentos'
      ],
      secretaria: [
        'tab-dashboard', 'tab-calendario', 'tab-usuarios', 'tab-cursos', 'tab-disciplinas', 'tab-turmas',
        'tab-financeiro', 'tab-frequencia', 'tab-horarios', 'tab-documentos'
      ],
      professor: [
        'tab-dashboard', 'tab-calendario', 'tab-turmas', 'tab-aulas', 'tab-frequencia', 'tab-notas',
        'tab-bibliografia', 'tab-horarios', 'tab-matriz'
      ],
      aluno: [
        'tab-dashboard', 'tab-calendario', 'tab-meu-curso', 'tab-financeiro', 'tab-horarios', 'tab-matriz', 'tab-documentos'
      ]
    };
    const allowed = roleAllowedTabs[role] || ['tab-dashboard'];
    if (this.activeTab && !allowed.includes(this.activeTab)) {
      this.switchTab('tab-dashboard');
    }

    this.render();
  }

  updateNavVisibility() {
    const roleMap = {
      gestao: ['.role-access-gestao'],
      secretaria: ['.role-access-secretaria'],
      professor: ['.role-access-professor'],
      aluno: ['.role-access-aluno']
    };

    // Hide all role specific nav headers & items first if needed
    const allRoleItems = document.querySelectorAll('.role-access-gestao, .role-access-secretaria, .role-access-professor, .role-access-aluno');
    allRoleItems.forEach(el => el.style.display = 'none');

    // Show allowed ones
    const allowedSelectors = roleMap[this.currentRole] || [];
    allowedSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.style.display = '');
    });
  }

  switchTab(tabId) {
    if (tabId === 'tab-grade') tabId = 'tab-horarios';
    this.activeTab = tabId;

    if (this.isLoggedIn) {
      localStorage.setItem('portal_active_tab', tabId);
    }

    // Fechar menu mobile ao selecionar
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');

    // Update active tab buttons
    document.querySelectorAll('.nav-item').forEach(el => {
      if (el.getAttribute('data-tab') === tabId) el.classList.add('active');
      else el.classList.remove('active');
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(el => {
      if (el.id === tabId) el.classList.add('active');
      else el.classList.remove('active');
    });

    // Update Headings
    const headingMap = {
      'tab-dashboard': ['Painel de Controle', 'Visão geral e indicadores acadêmicos da instituição'],
      'tab-calendario': ['Calendário Acadêmico', 'Marcos letivos, períodos de matrícula, avaliações, feriados e recessos escolares'],
      'tab-escolas': ['Minha Instituição', 'Dados cadastrais da instituição e gestão da unidade'],
      'tab-usuarios': ['Usuários & RAs', 'Gerenciamento de alunos, professores, secretaria e gestão com RA único'],
      'tab-cursos': ['Cursos & Duração', 'Configuração de cursos, níveis de ensino e duração'],
      'tab-disciplinas': ['Disciplinas & Periodicidade', 'Cadastro de disciplinas com periodicidade flexível'],
      'tab-turmas': ['Turmas & Vínculos', 'Formação de turmas, atribuição de professores e enturmação de alunos'],
      'tab-financeiro': ['Controle Financeiro', 'Gestão de mensalidades, recibos e quitação de taxas'],
      'tab-aulas': ['Diário & Aulas', 'Adicionar plano de aula, resumo de conteúdos e materiais'],
      'tab-frequencia': ['Chamada & Frequência', 'Controle diário de presença dos alunos'],
      'tab-notas': ['Notas & Avaliações', 'Lançamento de notas de provas, trabalhos e médias finais'],
      'tab-bibliografia': ['Referências Bibliográficas', 'Leituras obrigatórias e complementares'],
      'tab-horarios': ['Quadro de Horários', 'Quadro semanal de aulas por curso e turma'],
      'tab-matriz': ['Matriz Curricular', 'Matriz pedagógica de disciplinas por semestre e período'],
      'tab-documentos': ['Histórico & Documentos', 'Emissão instantânea com validação digital'],
      'tab-meu-curso': ['Meu Curso', 'Acompanhamento acadêmico de disciplinas, aulas, frequência, notas e bibliografia'],
      'tab-firebase': ['Firebase Firestore', 'Integração com banco de dados em tempo real']
    };

    if (headingMap[tabId]) {
      let [h, sub] = headingMap[tabId];
      if (tabId === 'tab-turmas' && this.currentRole === 'professor') {
        h = 'Minhas Turmas';
        sub = 'Turmas e disciplinas sob sua regência pedagógica';
      } else if (tabId === 'tab-financeiro' && this.currentRole === 'aluno') {
        h = 'Minhas Mensalidades';
        sub = 'Acompanhe seus pagamentos, parcelas, bolsas e emita comprovantes';
      }
      document.getElementById('page-heading').textContent = h;
      document.getElementById('page-subheading').textContent = sub;
    }

    this.render();
  }

  /* =========================================================================
     4. RENDERERS FOR EACH MODULE
     ========================================================================= */
  render() {
    this.renderSidebarSchool();
    this.renderDashboard();
    this.renderTabSchoolDetails();
    this.renderEscolasTable();
    this.renderUsuariosTable();
    this.renderCursosTable();
    this.renderDisciplinasTable();
    this.renderTurmasTable();
    this.renderFinanceiroTable();
    this.renderLessonsList();
    this.renderAttendanceTable();
    this.renderGradesTable();
    this.renderBiblioList();
    this.renderScheduleTable();
    this.renderCurriculumGrid();
    this.renderMeuCurso();
    this.populateSelectDropdowns();
    if (this.calendarModule) {
      this.calendarModule.render();
    }
    if (this.notificationsModule) {
      this.notificationsModule.generateNotifications();
    }
  }

  getActiveSchool() {
    return this.state.schools.find(s => s.id === this.state.activeSchoolId) || this.state.schools[0];
  }

  renderSidebarSchool() {
    const school = this.getActiveSchool();
    const el = document.getElementById('sidebar-school-name');
    if (el && school) {
      el.textContent = school.nome;
    }
  }

  renderDashboard() {
    const currentSchool = this.getActiveSchool();
    const schoolId = currentSchool ? currentSchool.id : null;
    const statsGrid = document.getElementById('dashboard-stats-grid');

    if (this.currentRole === 'professor') {
      // Localizar professor ativo
      const teacherUser = (this.currentUser && this.currentUser.tipo === 'professor')
        ? this.currentUser
        : (this.state.users.find(u => u.tipo === 'professor' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'professor'));

      // Filtrar turmas vinculadas ao professor nesta instituição
      const profTurmas = this.state.classes.filter(t => {
        if (t.schoolId !== schoolId) return false;
        if (teacherUser) {
          if (t.teacherId === teacherUser.id) return true;
          if (t.disciplines && t.disciplines.some(d => d.teacherId === teacherUser.id && d.status !== 'arquivada')) return true;
          return false;
        }
        return true;
      });

      // Disciplinas distintas ministradas pelo professor
      const profDisciplines = new Set();
      profTurmas.forEach(t => {
        if (t.disciplines && t.disciplines.length > 0) {
          t.disciplines.forEach(d => {
            if (d.status !== 'arquivada' && (!teacherUser || d.teacherId === teacherUser.id || t.teacherId === teacherUser.id)) {
              profDisciplines.add(d.disciplineId);
            }
          });
        } else if (t.disciplineId) {
          profDisciplines.add(t.disciplineId);
        }
      });
      const profDisciplineCount = profDisciplines.size;

      // Alunos únicos atendidos pelo professor
      const profStudentIds = new Set();
      profTurmas.forEach(t => {
        if (t.disciplines && t.disciplines.length > 0) {
          t.disciplines.forEach(d => {
            if (d.status !== 'arquivada' && (!teacherUser || d.teacherId === teacherUser.id || t.teacherId === teacherUser.id)) {
              const enrolled = this.getEnrolledStudentsForTurmaDiscipline ? this.getEnrolledStudentsForTurmaDiscipline(`${t.id}__${d.id}`) : [];
              if (enrolled && enrolled.length > 0) {
                enrolled.forEach(st => profStudentIds.add(st.id));
              } else {
                (t.studentIds || []).forEach(sId => profStudentIds.add(sId));
              }
            }
          });
        } else {
          (t.studentIds || []).forEach(sId => profStudentIds.add(sId));
        }
      });
      const profStudentsCount = profStudentIds.size;

      // Contar aulas registradas nas turmas do professor
      const profLessons = (this.state.lessons || []).filter(les => {
        if (!les.turmaId) return false;
        const [lTId] = les.turmaId.split('__');
        return profTurmas.some(t => t.id === lTId);
      });
      const profLessonsCount = profLessons.length;

      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="stat-card" onclick="app.switchTab('tab-turmas')" style="cursor: pointer;" title="Clique para gerenciar suas turmas e disciplinas">
            <div class="stat-icon indigo">
              <i class="fa-solid fa-chalkboard-user"></i>
            </div>
            <div class="stat-details">
              <h3>Turmas & Disciplinas</h3>
              <div class="value">${profTurmas.length} <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-muted);">(${profDisciplineCount} disc.)</span></div>
              <div class="subtext">${profDisciplineCount} disciplina(s) sob docência</div>
            </div>
          </div>

          <div class="stat-card" onclick="app.switchTab('tab-turmas')" style="cursor: pointer;" title="Clique para ver alunos enturmados">
            <div class="stat-icon emerald">
              <i class="fa-solid fa-users"></i>
            </div>
            <div class="stat-details">
              <h3>Total de Alunos</h3>
              <div class="value">${profStudentsCount}</div>
              <div class="subtext">Alunos atendidos</div>
            </div>
          </div>

          <div class="stat-card" onclick="app.switchTab('tab-aulas')" style="cursor: pointer;" title="Clique para ver Diário, Aulas e Resumo de Frequência">
            <div class="stat-icon sky">
              <i class="fa-solid fa-clipboard-user"></i>
            </div>
            <div class="stat-details">
              <h3>Diário de Aulas</h3>
              <div class="value">${profLessonsCount}</div>
              <div class="subtext">Aulas e chamadas registradas</div>
            </div>
          </div>
        `;
      }

      const roleSummaryEl = document.getElementById('dashboard-role-summary');
      if (roleSummaryEl) {
        roleSummaryEl.innerHTML = `
          <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border-left: 4px solid var(--warning);">
            <strong>Minhas Turmas & Aulas:</strong> Você possui <strong>${profTurmas.length} turma(s)</strong> e <strong>${profDisciplineCount} disciplina(s)</strong> sob sua docência para lançamento de frequência, notas e diário de classe.
          </div>
        `;
      }

    } else if (this.currentRole === 'aluno') {
      // Localizar aluno ativo
      const studentUser = (this.currentUser && this.currentUser.tipo === 'aluno')
        ? this.currentUser
        : (this.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'aluno'));

      const studentTurmas = studentUser ? this.state.classes.filter(t => 
        t.schoolId === schoolId && (t.studentIds || []).includes(studentUser.id)
      ) : [];

      // Mapear disciplinas ativas nas quais o aluno está matriculado e calcular frequência individual
      const activeDisciplinesList = [];
      if (studentUser) {
        studentTurmas.forEach(t => {
          this.ensureTurmaDisciplines(t);
          if (t.disciplines && t.disciplines.length > 0) {
            t.disciplines.forEach(td => {
              if (td.status !== 'arquivada') {
                let st = 'matriculado';
                if (td.studentStatuses && td.studentStatuses[studentUser.id] !== undefined) {
                  st = td.studentStatuses[studentUser.id];
                } else if (Array.isArray(td.studentIds)) {
                  st = td.studentIds.includes(studentUser.id) ? 'matriculado' : 'dispensado';
                }
                if (st === 'matriculado') {
                  const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
                  if (disc && !activeDisciplinesList.some(item => item.discId === disc.id)) {
                    // Contar aulas dessa turma / disciplina
                    const discLessons = (this.state.lessons || []).filter(l => {
                      if (!l.turmaId) return false;
                      if (l.turmaId === `${t.id}__${td.id}`) return true;
                      if (l.turmaId === t.id) return true;
                      return false;
                    });

                    let discPresencas = 0;
                    let discTotalAulas = discLessons.length;
                    discLessons.forEach(les => {
                      const att = this.state.attendance ? this.state.attendance[les.id] : null;
                      if (att && att[studentUser.id]) {
                        if (att[studentUser.id] === 'Presente' || att[studentUser.id] === 'Justificado') {
                          discPresencas++;
                        }
                      } else {
                        discPresencas++; // Default presente se chamada pendente
                      }
                    });

                    const pct = discTotalAulas > 0 ? Math.round((discPresencas / discTotalAulas) * 100) : 100;
                    const codeLabel = disc.code || disc.sigla || (disc.name ? disc.name.split(' ').map(w => w[0]).join('').substring(0, 6).toUpperCase() : 'DISC');

                    activeDisciplinesList.push({
                      turmaId: t.id,
                      tdId: td.id,
                      discId: disc.id,
                      code: codeLabel,
                      name: disc.name,
                      pct,
                      totalAulas: discTotalAulas
                    });
                  }
                }
              }
            });
          } else if (t.disciplineId) {
            const disc = (this.state.disciplines || []).find(d => d.id === t.disciplineId);
            if (disc && !activeDisciplinesList.some(item => item.discId === disc.id)) {
              const discLessons = (this.state.lessons || []).filter(l => l.turmaId === t.id);
              let discPresencas = 0;
              let discTotalAulas = discLessons.length;
              discLessons.forEach(les => {
                const att = this.state.attendance ? this.state.attendance[les.id] : null;
                if (att && att[studentUser.id]) {
                  if (att[studentUser.id] === 'Presente' || att[studentUser.id] === 'Justificado') {
                    discPresencas++;
                  }
                } else {
                  discPresencas++;
                }
              });
              const pct = discTotalAulas > 0 ? Math.round((discPresencas / discTotalAulas) * 100) : 100;
              const codeLabel = disc.code || disc.sigla || (disc.name ? disc.name.split(' ').map(w => w[0]).join('').substring(0, 6).toUpperCase() : 'DISC');

              activeDisciplinesList.push({
                turmaId: t.id,
                tdId: null,
                discId: disc.id,
                code: codeLabel,
                name: disc.name,
                pct,
                totalAulas: discTotalAulas
              });
            }
          }
        });
      }
      const studentDiscsCount = activeDisciplinesList.length;

      // Calcular média de notas por disciplina do aluno
      activeDisciplinesList.forEach(item => {
        const evals = (this.state.evaluations || []).filter(ev => {
          if (item.tdId && ev.turmaDisciplinaId === item.tdId) return true;
          if (ev.disciplineId === item.discId) return true;
          if (item.turmaId && ev.turmaId === item.turmaId && !ev.turmaDisciplinaId && !ev.disciplineId) return true;
          return false;
        });
        let sW = 0;
        let sG = 0;
        if (studentUser && this.state.studentGrades) {
          evals.forEach(ev => {
            const gradeKey = `${ev.id}_${studentUser.id}`;
            if (this.state.studentGrades[gradeKey] !== undefined && this.state.studentGrades[gradeKey] !== '') {
              const val = parseFloat(this.state.studentGrades[gradeKey]);
              if (!isNaN(val)) {
                const w = parseFloat(ev.weight) || 1.0;
                sW += w;
                sG += val * w;
              }
            }
          });
        }
        item.media = sW > 0 ? (sG / sW).toFixed(1) : '-';
      });

      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="stat-card" onclick="app.goToStudentDisciplines()" style="cursor: pointer;" title="Clique para ver suas disciplinas no Meu Curso">
            <div class="stat-icon sky">
              <i class="fa-solid fa-book-bookmark"></i>
            </div>
            <div class="stat-details">
              <h3>Disciplinas Matriculadas</h3>
              <div class="value">${studentDiscsCount}</div>
              <div class="subtext">Grade ativa no semestre</div>
            </div>
          </div>

          <div class="stat-card" style="cursor: default;" title="Frequência por disciplina ativa">
            <div class="stat-icon emerald" style="align-self: flex-start; margin-top: 4px;">
              <i class="fa-solid fa-clipboard-user"></i>
            </div>
            <div class="stat-details" style="min-width: 0; flex: 1;">
              <h3>Frequência por Disciplina</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center;">
                ${activeDisciplinesList.length === 0
                  ? `<span style="font-size: 0.82rem; color: var(--text-muted);">Nenhuma disciplina ativa</span>`
                  : activeDisciplinesList.map(item => {
                      const isGood = item.pct >= 75;
                      const bg = isGood ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)';
                      const color = isGood ? '#059669' : '#dc2626';
                      const border = isGood ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)';
                      return `
                        <button type="button" 
                                class="badge student-freq-tag" 
                                onclick="event.stopPropagation(); app.openStudentDisciplineFrequency('${item.discId}')"
                                title="${this.escapeHTML(item.name)}: ${item.pct}% de presença (${item.totalAulas} aulas) — Clique para abrir no Meu Curso" 
                                style="background: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 0.72rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; line-height: 1.2; outline: none; border-style: solid;">
                          <span>${this.escapeHTML(item.code)}:</span>
                          <strong>${item.pct}%</strong>
                          ${!isGood ? '<i class="fa-solid fa-triangle-exclamation" style="font-size: 0.65rem;" title="Abaixo do limite de 75%"></i>' : ''}
                        </button>
                      `;
                    }).join('')
                }
              </div>
              <div class="subtext" style="margin-top: 6px; font-size: 0.75rem;">Clique em uma disciplina para ver suas presenças</div>
            </div>
          </div>

          <div class="stat-card" style="cursor: default;" title="Média por disciplina ativa">
            <div class="stat-icon amber" style="align-self: flex-start; margin-top: 4px;">
              <i class="fa-solid fa-award"></i>
            </div>
            <div class="stat-details" style="min-width: 0; flex: 1;">
              <h3>Média por Disciplina</h3>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center;">
                ${activeDisciplinesList.length === 0
                  ? `<span style="font-size: 0.82rem; color: var(--text-muted);">Nenhuma disciplina ativa</span>`
                  : activeDisciplinesList.map(item => {
                      const hasGrade = item.media !== '-';
                      const numGrade = hasGrade ? parseFloat(item.media) : null;
                      const isGood = hasGrade && numGrade >= 7.0;
                      const isDanger = hasGrade && numGrade < 7.0;
                      
                      let bg = 'rgba(100, 116, 139, 0.12)';
                      let color = 'var(--text-muted, #64748b)';
                      let border = 'rgba(100, 116, 139, 0.3)';
                      
                      if (isGood) {
                        bg = 'rgba(16, 185, 129, 0.12)';
                        color = '#059669';
                        border = 'rgba(16, 185, 129, 0.3)';
                      } else if (isDanger) {
                        bg = 'rgba(239, 68, 68, 0.15)';
                        color = '#dc2626';
                        border = 'rgba(239, 68, 68, 0.4)';
                      }

                      return `
                        <button type="button" 
                                class="badge student-grade-tag" 
                                onclick="event.stopPropagation(); app.openStudentDisciplineGrades('${item.discId}')"
                                title="${this.escapeHTML(item.name)}: Média ${item.media} — Clique para abrir no Meu Curso" 
                                style="background: ${bg}; color: ${color}; border: 1px solid ${border}; font-size: 0.72rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; line-height: 1.2; outline: none; border-style: solid;">
                          <span>${this.escapeHTML(item.code)}:</span>
                          <strong>${item.media}</strong>
                          ${isDanger ? '<i class="fa-solid fa-triangle-exclamation" style="font-size: 0.65rem;" title="Média abaixo de 7.0"></i>' : ''}
                        </button>
                      `;
                    }).join('')
                }
              </div>
              <div class="subtext" style="margin-top: 6px; font-size: 0.75rem;">Clique em uma disciplina para ver suas notas</div>
            </div>
          </div>
        `;
      }

      const roleSummaryEl = document.getElementById('dashboard-role-summary');
      if (roleSummaryEl) {
        roleSummaryEl.innerHTML = `
          <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border-left: 4px solid var(--info);">
            <strong>Acesso Rápido Aluno:</strong> Você está matriculado em <strong>${studentDiscsCount} disciplina(s)</strong>. Consulte suas presenças, avaliações, horários e acervo bibliográfico nas abas correspondentes.
          </div>
        `;
      }

    } else {
      // Gestão & Secretaria (Visão Administrativa)
      const alunoCount = this.state.users.filter(u => u.tipo === 'aluno' && u.schoolId === schoolId).length;
      const cursoCount = this.state.courses.filter(c => c.schoolId === schoolId).length;

      const schoolFinances = (this.state.financial || []).filter(f => f.schoolId === schoolId);
      let adimplenciaTaxa = 98;
      if (schoolFinances.length > 0) {
        const pagas = schoolFinances.filter(f => f.status === 'Pago').length;
        adimplenciaTaxa = Math.round((pagas / schoolFinances.length) * 100);
      }

      if (statsGrid) {
        statsGrid.innerHTML = `
          <div class="stat-card" onclick="app.switchTab('tab-usuarios')" style="cursor: pointer;" title="Clique para gerenciar alunos e usuários">
            <div class="stat-icon emerald">
              <i class="fa-solid fa-user-graduate"></i>
            </div>
            <div class="stat-details">
              <h3>Alunos Matriculados</h3>
              <div class="value" id="stat-count-alunos">${alunoCount}</div>
              <div class="subtext">Com RA Gerado</div>
            </div>
          </div>

          <div class="stat-card" onclick="app.switchTab('tab-cursos')" style="cursor: pointer;" title="Clique para gerenciar cursos e matriz">
            <div class="stat-icon amber">
              <i class="fa-solid fa-scroll"></i>
            </div>
            <div class="stat-details">
              <h3>Cursos & Ofertas</h3>
              <div class="value" id="stat-count-cursos">${cursoCount}</div>
              <div class="subtext">Grade Ativa</div>
            </div>
          </div>

          <div class="stat-card" onclick="app.switchTab('tab-financeiro')" style="cursor: pointer;" title="Clique para ver controle financeiro">
            <div class="stat-icon sky">
              <i class="fa-solid fa-file-invoice-dollar"></i>
            </div>
            <div class="stat-details">
              <h3>Adimplência</h3>
              <div class="value" id="stat-adimplencia">${adimplenciaTaxa}%</div>
              <div class="subtext">Mensalidades em dia</div>
            </div>
          </div>
        `;
      }

      const roleSummaryEl = document.getElementById('dashboard-role-summary');
      if (roleSummaryEl) {
        roleSummaryEl.innerHTML = `
          <div style="background: var(--bg-main); padding: 0.85rem; border-radius: 8px; border-left: 4px solid var(--primary);">
            <strong>Status da Gestão:</strong> A plataforma possui <strong>${alunoCount} alunos</strong> cadastrados e <strong>${cursoCount} cursos</strong> ativos nesta unidade.
          </div>
        `;
      }
    }

    // Active school details box (visível para todos os perfis: Gestão, Professor, Aluno)
    const schoolDetailsEl = document.getElementById('dashboard-school-details');
    if (schoolDetailsEl && currentSchool) {
      schoolDetailsEl.innerHTML = `
        <div style="line-height: 1.8;">
          <h3 style="font-size: 1.2rem; color: var(--primary); font-family: var(--font-heading); margin-bottom: 0.5rem;">${this.escapeHTML(currentSchool.nome)}</h3>
          <p><strong><i class="fa-solid fa-envelope"></i> E-mail Direção:</strong> ${this.escapeHTML(currentSchool.email || '-')}</p>
          <p><strong><i class="fa-solid fa-id-card"></i> CNPJ:</strong> ${this.escapeHTML(currentSchool.cnpj || 'Não informado')}</p>
          <p><strong><i class="fa-solid fa-phone"></i> Contato:</strong> ${this.escapeHTML(currentSchool.telefone || 'Não informado')}</p>
          <p><strong><i class="fa-solid fa-location-dot"></i> Endereço:</strong> ${this.escapeHTML(currentSchool.endereco || '')} - ${this.escapeHTML(currentSchool.cidade || '')}</p>
        </div>
      `;
    }

    this.renderDashboardNotices();
  }

  /* --- Escolas & Alternância de Instituições --- */
  renderTabSchoolDetails() {
    const container = document.getElementById('tab-school-full-details');
    if (!container) return;

    const school = this.getActiveSchool();
    if (!school) {
      container.innerHTML = `<p style="color: var(--text-muted);">Nenhuma instituição selecionada.</p>`;
      return;
    }

    container.innerHTML = `
      <div class="grid-2" style="gap: 1.25rem; margin-top: 0.5rem;">
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Nome da Instituição</label>
          <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${this.escapeHTML(school.nome)}</div>
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Diretor / Gestor Responsável</label>
          <div style="font-size: 1rem; color: var(--text-main); font-weight: 600;">${this.escapeHTML(school.diretor || 'Direção Geral')}</div>
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">E-mail Institucional</label>
          <div style="font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(school.email || '-')}</div>
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">CNPJ / Registro MEC</label>
          <div style="font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(school.cnpj || 'Não informado')}</div>
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Telefone / Contato</label>
          <div style="font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(school.telefone || 'Não informado')}</div>
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Cidade / UF</label>
          <div style="font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(school.cidade || 'Não informada')}</div>
        </div>
        <div style="grid-column: span 2;">
          <label style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Endereço Completo</label>
          <div style="font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(school.endereco || 'Endereço não informado')}</div>
        </div>
        <div style="grid-column: span 2; padding: 0.95rem 1.15rem; background: rgba(0, 189, 174, 0.05); border: 1px solid rgba(0, 189, 174, 0.25); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <i class="fa-brands fa-pix" style="color: #00bdae; font-size: 1rem;"></i> Chave PIX da Instituição (Mensalidades)
              </span>
              <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                ${school.chavePix 
                  ? `<span style="font-family: var(--font-mono);">${this.escapeHTML(school.chavePix)}</span> <span class="badge" style="background: #00bdae; color: #fff; font-size:0.72rem; text-transform:uppercase; font-weight: 700; padding: 2px 7px;">${this.escapeHTML(school.tipoChavePix || 'CNPJ')}</span>` 
                  : '<span style="color: var(--text-muted); font-size: 0.88rem; font-weight: normal;"><i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> Nenhuma chave PIX configurada</span>'}
              </div>
              <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">
                Beneficiário / Favorecido: <strong>${this.escapeHTML(school.beneficiarioPix || school.nome || 'Instituição')}</strong>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm role-access-gestao" onclick="app.openEditSchoolModal()" title="Configurar ou alterar Chave PIX" style="display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-gear"></i> Configurar Chave PIX
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderEscolasTable() {
    const tbody = document.getElementById('table-escolas-body');
    if (!tbody) return;

    const userEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    // Filtra os acessos que pertencem a este mesmo e-mail (caso seja gestor em mais de uma instituição)
    const userAccounts = this.state.users.filter(u => u.email && u.email.toLowerCase() === userEmail);
    const userSchools = userAccounts.map(acc => {
      const sch = this.state.schools.find(s => s.id === acc.schoolId);
      return sch ? { school: sch, user: acc } : null;
    }).filter(Boolean);

    // Se por acaso não achar por email, exibe a escola ativa
    const displayList = userSchools.length > 0 ? userSchools : [{ school: this.getActiveSchool(), user: this.currentUser }];

    tbody.innerHTML = displayList.map(item => {
      const s = item.school;
      if (!s) return '';
      const isActive = s.id === this.state.activeSchoolId;

      return `
        <tr>
          <td><strong>${this.escapeHTML(s.nome)}</strong></td>
          <td>${this.escapeHTML(s.email)}</td>
          <td>${this.escapeHTML(s.cnpj || '-')}</td>
          <td>${this.escapeHTML(s.cidade || '-')}</td>
          <td>
            ${isActive 
              ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Em Uso (Ativa)</span>`
              : `<span class="badge badge-primary">Vinculada</span>`}
          </td>
          <td>
            ${!isActive 
              ? `<button class="btn btn-secondary btn-sm" onclick="app.switchActiveAccount('${item.user ? item.user.id : ''}')"><i class="fa-solid fa-repeat"></i> Visualizar Esta</button>`
              : `<span style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-eye"></i> Visualizando</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  setActiveSchool(id) {
    this.state.activeSchoolId = id;
    this.saveState();
    this.render();
  }

  openEditSchoolModal() {
    if (!this.checkPermission(['gestao'], 'editar os dados da instituição')) return;

    const school = this.getActiveSchool();
    if (!school) return;

    const nameInput = document.getElementById('edit-school-name');
    const directorInput = document.getElementById('edit-school-director');
    const emailInput = document.getElementById('edit-school-email');
    const cnpjInput = document.getElementById('edit-school-cnpj');
    const phoneInput = document.getElementById('edit-school-phone');
    const cityInput = document.getElementById('edit-school-city');
    const addressInput = document.getElementById('edit-school-address');

    if (nameInput) nameInput.value = school.nome || '';
    if (directorInput) directorInput.value = school.diretor || '';
    if (emailInput) emailInput.value = school.email || '';
    if (cnpjInput) cnpjInput.value = school.cnpj && school.cnpj !== 'Não informado' ? school.cnpj : '';
    if (phoneInput) phoneInput.value = school.telefone && school.telefone !== 'Não informado' ? school.telefone : '';
    if (cityInput) cityInput.value = school.cidade && school.cidade !== 'Não informada' ? school.cidade : '';
    if (addressInput) addressInput.value = school.endereco && school.endereco !== 'Endereço não informado' ? school.endereco : '';

    const notaAprovacaoInput = document.getElementById('edit-school-nota-aprovacao');
    const notaExameInput = document.getElementById('edit-school-nota-exame');
    if (notaAprovacaoInput) notaAprovacaoInput.value = (school.criterioAvaliacao && school.criterioAvaliacao.notaAprovacao !== undefined) ? school.criterioAvaliacao.notaAprovacao : 6.0;
    if (notaExameInput) notaExameInput.value = (school.criterioAvaliacao && school.criterioAvaliacao.notaExame !== undefined) ? school.criterioAvaliacao.notaExame : 4.0;

    // Chave PIX da Instituição
    const pixTipoInput = document.getElementById('edit-school-pix-tipo');
    const pixChaveInput = document.getElementById('edit-school-pix-chave');
    const pixBeneficiarioInput = document.getElementById('edit-school-pix-beneficiario');
    if (pixTipoInput) pixTipoInput.value = school.tipoChavePix || 'cnpj';
    if (pixChaveInput) pixChaveInput.value = school.chavePix || '';
    if (pixBeneficiarioInput) pixBeneficiarioInput.value = school.beneficiarioPix || '';
    this.handlePixTypeChange();

    document.getElementById('modal-edit-school').classList.add('open');
  }

  handlePixTypeChange() {
    const tipo = document.getElementById('edit-school-pix-tipo')?.value || 'cnpj';
    const chaveInput = document.getElementById('edit-school-pix-chave');
    if (!chaveInput) return;

    const placeholders = {
      'cnpj': '00.000.000/0001-00',
      'cpf': '000.000.000-00',
      'email': 'financeiro@escola.com.br',
      'telefone': '(11) 98765-4321 ou +5511987654321',
      'aleatoria': 'Chave EVP aleatória (ex: 123e4567-e89b-12d3-a456-426614174000)'
    };
    chaveInput.placeholder = placeholders[tipo] || 'Informe a chave PIX';
  }

  handleUpdateSchool(event) {
    event.preventDefault();
    if (!this.checkPermission(['gestao'], 'salvar alterações da instituição')) return;

    const school = this.getActiveSchool();
    if (!school) return;

    const name = document.getElementById('edit-school-name').value.trim();
    const director = document.getElementById('edit-school-director').value.trim();
    const email = document.getElementById('edit-school-email').value.trim();
    const cnpj = document.getElementById('edit-school-cnpj').value.trim();
    const phone = document.getElementById('edit-school-phone').value.trim();
    const city = document.getElementById('edit-school-city').value.trim();
    const address = document.getElementById('edit-school-address').value.trim();

    const pixTipo = document.getElementById('edit-school-pix-tipo')?.value || 'cnpj';
    const pixChave = document.getElementById('edit-school-pix-chave')?.value.trim() || '';
    const pixBeneficiario = document.getElementById('edit-school-pix-beneficiario')?.value.trim() || '';

    const notaAprovacaoRaw = parseFloat(document.getElementById('edit-school-nota-aprovacao')?.value);
    const notaExameRaw = parseFloat(document.getElementById('edit-school-nota-exame')?.value);

    if (!name || !email) {
      this.showToast('Por favor, informe ao menos o Nome da Instituição e o E-mail de Contato.', 'warning');
      return;
    }

    // Atualiza os dados da escola ativa
    school.nome = name;
    school.diretor = director || 'Diretor(a) Responsável';
    school.email = email;
    school.cnpj = cnpj || 'Não informado';
    school.telefone = phone || 'Não informado';
    school.cidade = city || 'Não informada';
    school.endereco = address || 'Endereço não informado';
    school.tipoChavePix = pixTipo;
    school.chavePix = pixChave;
    school.beneficiarioPix = pixBeneficiario;
    school.criterioAvaliacao = {
      notaAprovacao: !isNaN(notaAprovacaoRaw) ? notaAprovacaoRaw : 6.0,
      notaExame: !isNaN(notaExameRaw) ? notaExameRaw : 4.0
    };

    // Se o gestor conectado for o diretor dessa escola e seu nome mudou, atualiza também
    if (this.currentUser && this.currentUser.tipo === 'gestao' && director) {
      this.currentUser.nome = director;
      localStorage.setItem('portal_current_user', JSON.stringify(this.currentUser));
    }

    this.saveState();
    this.closeModal('modal-edit-school', true);
    this.showToast(`Dados da instituição "${school.nome}" e chave PIX atualizados com sucesso!`, 'success');
    this.render();
  }

  /* --- Usuários & RA --- */
  renderUsuariosTable() {
    const tbody = document.getElementById('table-usuarios-body');
    if (!tbody) return;

    const activeSchool = this.getActiveSchool();
    let users = this.state.users.filter(u => u.schoolId === activeSchool.id);

    // Ajusta o rótulo do botão de criação de acordo com o perfil logado
    const btnText = document.getElementById('btn-novo-usuario-text');
    if (btnText) {
      btnText.textContent = this.currentRole === 'secretaria' ? 'Novo Aluno' : 'Novo Usuário';
    }

    // Popular o dropdown de cursos do filtro se necessário
    const filterCursoSelect = document.getElementById('users-filter-curso');
    if (filterCursoSelect && filterCursoSelect.options.length <= 1) {
      const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
      const currentVal = filterCursoSelect.value || 'todos';
      filterCursoSelect.innerHTML = `<option value="todos">Todos os Cursos</option><option value="sem_curso">Sem curso vinculado</option>` +
        schoolCourses.map(c => `<option value="${c.id}">${this.escapeHTML(c.code)} - ${this.escapeHTML(c.name)}</option>`).join('');
      filterCursoSelect.value = currentVal;
    }

    // Obter valores dos filtros
    const searchVal = (document.getElementById('users-search-input')?.value || '').trim().toLowerCase();
    const filterTipo = document.getElementById('users-filter-tipo')?.value || 'todos';
    const filterCurso = document.getElementById('users-filter-curso')?.value || 'todos';

    // 1. Filtrar por busca (Nome, RA, Email)
    if (searchVal) {
      users = users.filter(u => {
        const nome = (u.nome || '').toLowerCase();
        const ra = (u.ra || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        return nome.includes(searchVal) || ra.includes(searchVal) || email.includes(searchVal);
      });
    }

    // 2. Filtrar por perfil / tipo
    if (filterTipo && filterTipo !== 'todos') {
      users = users.filter(u => u.tipo === filterTipo);
    }

    // 3. Filtrar por curso vinculado
    if (filterCurso && filterCurso !== 'todos') {
      if (filterCurso === 'sem_curso') {
        users = users.filter(u => !u.cursoId);
      } else {
        users = users.filter(u => u.cursoId === filterCurso);
      }
    }

    if (users.length === 0) {
      const hasActiveFilters = searchVal || filterTipo !== 'todos' || filterCurso !== 'todos';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted);">
        <i class="fa-solid fa-user-slash" style="font-size: 2rem; opacity: 0.4; margin-bottom: 0.5rem; display: block;"></i>
        ${hasActiveFilters ? 'Nenhum usuário encontrado com os filtros aplicados.' : 'Nenhum usuário cadastrado nesta instituição ainda.'}
        ${hasActiveFilters ? '<br><button class="btn btn-secondary btn-sm" style="margin-top: 0.6rem;" onclick="app.clearUserFilters()"><i class="fa-solid fa-filter-circle-xmark"></i> Limpar Filtros</button>' : ''}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const curso = this.state.courses.find(c => c.id === u.cursoId);
      const roleBadgeClass = u.tipo === 'gestao' ? 'role-gestao' : u.tipo === 'secretaria' ? 'role-secretaria' : u.tipo === 'professor' ? 'role-professor' : 'role-aluno';
      const isSelf = this.currentUser && this.currentUser.id === u.id;
      
      // Permissão de exclusão: Gestão pode excluir qualquer um (exceto ele mesmo); Secretaria só pode excluir alunos
      const canDelete = (this.currentRole === 'gestao' && !isSelf) || (this.currentRole === 'secretaria' && u.tipo === 'aluno' && !isSelf);
      // Permissão de edição: Gestão pode editar qualquer um; Secretaria só pode editar alunos
      const canEdit = (this.currentRole === 'gestao') || (this.currentRole === 'secretaria' && u.tipo === 'aluno');

      return `
        <tr>
          <td>${u.ra ? `<span class="ra-badge">${this.escapeHTML(u.ra)}</span>` : '<span style="color:var(--text-muted); font-size:0.8rem;">-</span>'}</td>
          <td>
            <strong>${this.escapeHTML(u.nome)}</strong>
            ${isSelf ? '<span style="font-size:0.75rem; color:var(--primary); margin-left:6px; font-weight:700;">(Você)</span>' : ''}
            ${(u.telefone || u.cpf) ? `
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                ${u.cpf ? `CPF: ${this.escapeHTML(u.cpf)}` : ''} ${u.cpf && u.telefone ? '•' : ''} ${u.telefone ? `Tel: ${this.escapeHTML(u.telefone)}` : ''}
              </div>
            ` : ''}
          </td>
          <td>${this.escapeHTML(u.email)}</td>
          <td><span class="user-role-badge ${roleBadgeClass}">${this.escapeHTML(u.tipo.toUpperCase())}</span></td>
          <td>${curso ? this.escapeHTML(curso.name) : '<span style="color:var(--text-muted);">-</span>'}</td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              ${u.tipo === 'aluno' ? `
                <button class="btn btn-secondary btn-sm" onclick="app.openStudentCardModal('${u.id}')" title="Carteirinha Estudantil Digital (CIE)">
                  <i class="fa-solid fa-id-card"></i>
                </button>
                <button class="btn btn-secondary btn-sm" onclick="app.generateBoletim('${u.id}')" title="Emitir Boletim Escolar Oficial">
                  <i class="fa-solid fa-graduation-cap"></i>
                </button>
              ` : ''}
              ${canEdit ? `
                <button class="btn btn-primary btn-sm" onclick="app.editUser('${u.id}')" title="Editar Dados do Usuário">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
              ` : ''}
              ${canDelete ? `
                <button class="btn btn-secondary btn-sm" onclick="app.deleteUser('${u.id}')" title="Excluir Usuário">
                  <i class="fa-solid fa-trash"></i>
                </button>
              ` : isSelf ? `
                <span style="color:var(--text-muted); font-size:0.75rem;"><i class="fa-solid fa-user-check"></i> Conectado</span>
              ` : `
                <span style="color:var(--text-muted); font-size:0.75rem;" title="Permissão restrita à Gestão"><i class="fa-solid fa-lock"></i> Gestão</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  clearUserFilters() {
    const searchInput = document.getElementById('users-search-input');
    const tipoSelect = document.getElementById('users-filter-tipo');
    const cursoSelect = document.getElementById('users-filter-curso');

    if (searchInput) searchInput.value = '';
    if (tipoSelect) tipoSelect.value = 'todos';
    if (cursoSelect) cursoSelect.value = 'todos';

    this.renderUsuariosTable();
  }

  toggleUserRaField() {
    const userTipoSelect = document.getElementById('user-tipo');
    const tipo = userTipoSelect ? userTipoSelect.value : 'aluno';
    const raGroup = document.getElementById('group-user-ra');
    const raInput = document.getElementById('user-ra');

    if (tipo === 'aluno') {
      if (raGroup) raGroup.style.display = 'block';
      if (raInput && !raInput.value.trim()) {
        raInput.value = this.generateNextRA();
      }
    } else {
      if (raGroup) raGroup.style.display = 'none';
      if (raInput) raInput.value = '';
    }
  }

  openUserModal() {
    if (!this.checkPermission(['gestao', 'secretaria'], 'abrir cadastro de usuários')) return;

    const idInput = document.getElementById('user-id');
    const userTipoSelect = document.getElementById('user-tipo');
    const modalTitle = document.getElementById('modal-user-title');
    const saveBtn = document.getElementById('btn-save-user');
    const noticeEl = document.getElementById('modal-user-role-notice');
    const raInput = document.getElementById('user-ra');
    const nomeInput = document.getElementById('user-nome');
    const emailInput = document.getElementById('user-email');
    const emailHelp = document.getElementById('user-email-help');
    const passInput = document.getElementById('user-password');
    const passHelp = document.getElementById('user-password-help');
    const cursoSelect = document.getElementById('user-curso');

    // Limpar campos e resetar modo criação
    if (idInput) idInput.value = '';
    if (nomeInput) nomeInput.value = '';
    if (emailInput) {
      emailInput.value = '';
      emailInput.readOnly = false;
      emailInput.style.backgroundColor = '';
      emailInput.style.cursor = '';
    }
    if (emailHelp) emailHelp.style.display = 'none';

    if (passInput) {
      passInput.value = '';
      passInput.placeholder = 'Padrão: 123456';
    }
    if (passHelp) passHelp.textContent = 'Deixe em branco para usar a senha padrão inicial (123456).';

    if (raInput) raInput.value = '';
    if (cursoSelect) cursoSelect.value = '';

    const cpfInput = document.getElementById('user-cpf');
    const rgInput = document.getElementById('user-rg');
    const telInput = document.getElementById('user-telefone');
    const nascInput = document.getElementById('user-nascimento');
    const endInput = document.getElementById('user-endereco');

    if (cpfInput) cpfInput.value = '';
    if (rgInput) rgInput.value = '';
    if (telInput) telInput.value = '';
    if (nascInput) nascInput.value = '';
    if (endInput) endInput.value = '';

    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Usuário';

    if (this.currentRole === 'secretaria') {
      // Perfil Secretaria: Pode cadastrar exclusivamente ALUNOS
      if (modalTitle) {
        modalTitle.innerHTML = '<i class="fa-solid fa-user-graduate"></i> Cadastrar Novo Aluno (Secretaria)';
      }
      if (userTipoSelect) {
        userTipoSelect.innerHTML = `<option value="aluno" selected>Aluno (com RA Editável)</option>`;
        userTipoSelect.value = 'aluno';
        userTipoSelect.disabled = true; // Bloqueado para evitar alteração
      }
      if (noticeEl) {
        noticeEl.style.display = 'flex';
        noticeEl.innerHTML = `
          <i class="fa-solid fa-circle-info"></i>
          <div><strong>Acesso da Secretaria:</strong> Você tem permissão para cadastrar e matricular novos <strong>Alunos</strong> com Registro Acadêmico (RA).</div>
        `;
      }
    } else {
      // Perfil Gestão: Pode cadastrar TODOS (Alunos, Professores, Secretaria, Gestão)
      if (modalTitle) {
        modalTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> Cadastrar Usuário no Sistema';
      }
      if (userTipoSelect) {
        userTipoSelect.disabled = false;
        userTipoSelect.innerHTML = `
          <option value="aluno" selected>Aluno (com RA Editável)</option>
          <option value="professor">Professor (Corpo Docente)</option>
          <option value="secretaria">Secretaria (Administrativo Escolar)</option>
          <option value="gestao">Gestão (Direção / Coordenação)</option>
        `;
        userTipoSelect.value = 'aluno';
      }
      if (noticeEl) {
        noticeEl.style.display = 'flex';
        noticeEl.innerHTML = `
          <i class="fa-solid fa-shield-halved"></i>
          <div><strong>Acesso da Gestão:</strong> Como Gestor(a) da instituição, você pode adicionar novos <strong>Alunos</strong>, <strong>Professores</strong>, funcionários da <strong>Secretaria</strong> e outros usuários do tipo <strong>Gestão</strong>.</div>
        `;
      }
    }

    this.toggleUserRaField();
    this.populateSelectDropdowns();
    document.getElementById('modal-user').classList.add('open');
  }

  editUser(userId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'editar usuários')) return;

    const user = this.state.users.find(u => u.id === userId);
    if (!user) {
      this.showToast('Usuário não localizado para edição.', 'error');
      return;
    }

    // Se o usuário logado for Secretaria, só pode editar Alunos
    if (this.currentRole === 'secretaria' && user.tipo !== 'aluno') {
      this.showToast('A Secretaria tem permissão para editar exclusivamente alunos.', 'error', 'Acesso Negado');
      return;
    }

    this.populateSelectDropdowns();

    const idInput = document.getElementById('user-id');
    const modalTitle = document.getElementById('modal-user-title');
    const saveBtn = document.getElementById('btn-save-user');
    const noticeEl = document.getElementById('modal-user-role-notice');
    const userTipoSelect = document.getElementById('user-tipo');
    const nomeInput = document.getElementById('user-nome');
    const emailInput = document.getElementById('user-email');
    const emailHelp = document.getElementById('user-email-help');
    const passInput = document.getElementById('user-password');
    const passHelp = document.getElementById('user-password-help');
    const cursoSelect = document.getElementById('user-curso');
    const raInput = document.getElementById('user-ra');

    if (idInput) idInput.value = user.id;
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Dados do Usuário';
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar Usuário';

    if (nomeInput) nomeInput.value = user.nome || '';
    
    // E-MAIL NÃO PODE SER ALTERADO
    if (emailInput) {
      emailInput.value = user.email || '';
      emailInput.readOnly = true;
      emailInput.style.backgroundColor = 'var(--bg-card-secondary, rgba(0,0,0,0.05))';
      emailInput.style.cursor = 'not-allowed';
    }
    if (emailHelp) emailHelp.style.display = 'block';

    if (passInput) {
      passInput.value = '';
      passInput.placeholder = 'Deixe em branco para manter a mesma';
    }
    if (passHelp) passHelp.textContent = 'Deixe em branco caso não queira alterar a senha atual.';

    if (this.currentRole === 'secretaria') {
      if (userTipoSelect) {
        userTipoSelect.innerHTML = `<option value="aluno" selected>Aluno (com RA Editável)</option>`;
        userTipoSelect.value = 'aluno';
        userTipoSelect.disabled = true;
      }
    } else {
      if (userTipoSelect) {
        userTipoSelect.disabled = false;
        userTipoSelect.innerHTML = `
          <option value="aluno" ${user.tipo === 'aluno' ? 'selected' : ''}>Aluno (com RA Editável)</option>
          <option value="professor" ${user.tipo === 'professor' ? 'selected' : ''}>Professor (Corpo Docente)</option>
          <option value="secretaria" ${user.tipo === 'secretaria' ? 'selected' : ''}>Secretaria (Administrativo Escolar)</option>
          <option value="gestao" ${user.tipo === 'gestao' ? 'selected' : ''}>Gestão (Direção / Coordenação)</option>
        `;
        userTipoSelect.value = user.tipo;
      }
    }

    if (cursoSelect) {
      cursoSelect.value = user.cursoId || '';
    }

    if (raInput) {
      raInput.value = user.ra || '';
    }

    const cpfInput = document.getElementById('user-cpf');
    const rgInput = document.getElementById('user-rg');
    const telInput = document.getElementById('user-telefone');
    const nascInput = document.getElementById('user-nascimento');
    const endInput = document.getElementById('user-endereco');

    if (cpfInput) cpfInput.value = user.cpf || '';
    if (rgInput) rgInput.value = user.rg || '';
    if (telInput) telInput.value = user.telefone || '';
    if (nascInput) nascInput.value = user.dataNascimento || '';
    if (endInput) endInput.value = user.endereco || '';

    if (noticeEl) {
      noticeEl.style.display = 'none';
    }

    this.toggleUserRaField();
    document.getElementById('modal-user').classList.add('open');
  }

  handleSaveUser(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao', 'secretaria'], 'salvar usuários')) return;

    const userId = document.getElementById('user-id') ? document.getElementById('user-id').value.trim() : '';
    const userTipoSelect = document.getElementById('user-tipo');
    let tipo = userTipoSelect ? userTipoSelect.value : 'aluno';

    // Regra estrita: Secretaria só pode cadastrar/editar Aluno
    if (this.currentRole === 'secretaria') {
      tipo = 'aluno';
    }

    if (this.currentRole === 'secretaria' && tipo !== 'aluno') {
      this.showToast('Usuários do perfil Secretaria têm permissão apenas para gerenciar Alunos.', 'error', 'Acesso Negado');
      return;
    }

    const nome = document.getElementById('user-nome').value.trim();
    const passInput = document.getElementById('user-password');
    const newPassword = passInput && passInput.value.trim() ? passInput.value.trim() : '';
    const cursoSelect = document.getElementById('user-curso');
    const cursoId = cursoSelect ? cursoSelect.value : '';
    const activeSchool = this.getActiveSchool();

    const cpf = document.getElementById('user-cpf')?.value.trim() || '';
    const rg = document.getElementById('user-rg')?.value.trim() || '';
    const telefone = document.getElementById('user-telefone')?.value.trim() || '';
    const dataNascimento = document.getElementById('user-nascimento')?.value.trim() || '';
    const endereco = document.getElementById('user-endereco')?.value.trim() || '';

    if (!nome) {
      this.showToast('Por favor, preencha o Nome Completo do usuário.', 'warning');
      return;
    }

    if (dataNascimento && !this.usersModule.isValidDateBR(dataNascimento)) {
      this.showToast('Data de Nascimento inválida. Por favor, utilize o formato padrão brasileiro DD/MM/AAAA.', 'warning', 'Data Inválida');
      return;
    }

    if (userId) {
      // MODO EDIÇÃO
      const targetUser = this.state.users.find(u => u.id === userId);
      if (!targetUser) {
        this.showToast('Erro ao atualizar: usuário não localizado.', 'error');
        return;
      }

      // E-MAIL NUNCA É ALTERADO NA EDIÇÃO
      const email = targetUser.email;

      let ra = null;
      if (tipo === 'aluno') {
        const typedRa = document.getElementById('user-ra').value.trim();
        if (!typedRa) {
          this.showToast('Por favor, informe o Registro Acadêmico (RA) do aluno.', 'warning');
          return;
        }

        // Validação de RA Único (excluindo o próprio usuário sendo editado)
        const duplicateRA = this.state.users.find(u => 
          u.schoolId === activeSchool.id && 
          u.id !== userId && 
          u.ra && 
          u.ra.toLowerCase() === typedRa.toLowerCase()
        );
        if (duplicateRA) {
          this.showToast(`O RA "${typedRa}" já pertence ao aluno "${duplicateRA.nome}". Por favor, utilize um RA exclusivo.`, 'warning', 'RA em Uso');
          return;
        }

        ra = typedRa;
      }

      targetUser.nome = nome;
      targetUser.tipo = tipo;
      targetUser.ra = ra;
      targetUser.cursoId = cursoId || null;
      targetUser.cpf = cpf;
      targetUser.rg = rg;
      targetUser.telefone = telefone;
      targetUser.dataNascimento = dataNascimento;
      targetUser.endereco = endereco;
      if (newPassword) {
        targetUser.password = newPassword;
      }
      targetUser.atualizadoEm = new Date().toISOString();

      // Se o usuário editou o seu próprio perfil logado
      if (this.currentUser && this.currentUser.id === targetUser.id) {
        this.currentUser = targetUser;
        localStorage.setItem('portal_current_user', JSON.stringify(targetUser));
        this.currentRole = targetUser.tipo;
        this.updateSidebarUserInfo();
      }

      this.saveState();

      // Atualização no Firestore
      if (this.isFirebaseActive && this.db) {
        try {
          setDoc(doc(this.db, 'usuarios', targetUser.id), JSON.parse(JSON.stringify(targetUser)))
            .catch(err => console.warn('Aviso Firestore: Não foi possível atualizar usuário no Firestore:', err));
        } catch (e) {}
      }

      const userForm = document.querySelector('#modal-user form');
      if (userForm) userForm.dataset.dirty = 'false';
      this.closeModal('modal-user', true);
      this.showToast(`Dados do usuário "${nome}" atualizados com sucesso!`, 'success');
      this.render();

    } else {
      // MODO NOVO CADASTRO
      const email = document.getElementById('user-email').value.trim();
      const password = newPassword || '123456';

      if (!email) {
        this.showToast('Por favor, preencha o E-mail de acesso do usuário.', 'warning');
        return;
      }

      // Validação de E-mail duplicado na mesma escola
      const duplicateEmail = this.state.users.find(u => u.schoolId === activeSchool.id && u.email.toLowerCase() === email.toLowerCase());
      if (duplicateEmail) {
        this.showToast(`Já existe um usuário cadastrado com o e-mail "${email}" nesta instituição (${duplicateEmail.nome} - perfil ${duplicateEmail.tipo.toUpperCase()}).`, 'warning', 'E-mail Duplicado');
        return;
      }

      let ra = null;
      if (tipo === 'aluno') {
        const typedRa = document.getElementById('user-ra').value.trim();
        if (!typedRa) {
          this.showToast('Por favor, informe o Registro Acadêmico (RA) do aluno.', 'warning');
          return;
        }

        // Validação de RA Único
        const duplicateRA = this.state.users.find(u => u.schoolId === activeSchool.id && u.ra && u.ra.toLowerCase() === typedRa.toLowerCase());
        if (duplicateRA) {
          this.showToast(`O RA "${typedRa}" já pertence ao aluno "${duplicateRA.nome}". Por favor, utilize um RA exclusivo.`, 'warning', 'RA em Uso');
          return;
        }

        ra = typedRa;
      }

      const newUser = {
        id: this.generateUniqueId('usr'),
        schoolId: activeSchool.id,
        nome,
        email,
        password,
        tipo,
        ra,
        cpf,
        rg,
        telefone,
        dataNascimento,
        endereco,
        cursoId: cursoId || null,
        criadoPor: this.currentUser ? this.currentUser.email : 'sistema',
        criadoEm: new Date().toISOString()
      };

      this.state.users.push(newUser);
      this.saveState();

      // Gravação direta no Firestore
      if (this.isFirebaseActive && this.db) {
        try {
          setDoc(doc(this.db, 'usuarios', newUser.id), JSON.parse(JSON.stringify(newUser)))
            .catch(err => console.warn('Aviso Firestore: Não foi possível gravar o usuário no Firestore agora:', err));
        } catch (e) {}
      }

      // Criação no Firebase Authentication
      this.createUserInFirebaseAuth(newUser.email, newUser.password);

      const userForm = document.querySelector('#modal-user form');
      if (userForm) {
        userForm.dataset.dirty = 'false';
        userForm.reset();
      }
      this.closeModal('modal-user', true);

      const roleNames = {
        aluno: 'Aluno(a)',
        professor: 'Professor(a)',
        secretaria: 'Secretaria',
        gestao: 'Gestor(a)'
      };
      const roleLabel = roleNames[tipo] || tipo.toUpperCase();

      this.showToast(`${roleLabel} "${nome}" cadastrado(a) com sucesso!\n• Login: ${tipo === 'aluno' && ra ? `${email} ou RA: ${ra}` : email}\n• Senha Inicial: ${password}`, 'success', 'Usuário Criado', 6000);
      this.render();
    }
  }

  async deleteUser(id) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'excluir usuários')) return;

    const targetUser = this.state.users.find(u => u.id === id);
    if (!targetUser) return;

    // Se o usuário logado for Secretaria, só pode excluir Alunos
    if (this.currentRole === 'secretaria' && targetUser.tipo !== 'aluno') {
      this.showToast('Usuários da Secretaria só possuem permissão para excluir alunos.', 'error', 'Acesso Negado');
      return;
    }

    // Ninguém pode excluir a si mesmo
    if (this.currentUser && targetUser.id === this.currentUser.id) {
      this.showToast('Você não pode excluir o seu próprio usuário conectado.', 'warning', 'Atenção');
      return;
    }

    const confirmed = await this.confirmAction({
      title: 'Excluir Usuário',
      message: `Deseja realmente remover o usuário "${targetUser.nome}" (${targetUser.tipo.toUpperCase()}) da instituição?`,
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.users = this.state.users.filter(u => u.id !== id);
      this.saveState();

      // Deletar também o documento individual da coleção 'usuarios' no Firestore
      if (this.isFirebaseActive && this.db) {
        try {
          deleteDoc(doc(this.db, 'usuarios', id))
            .catch(err => console.warn('Aviso Firestore: Não foi possível remover o documento do usuário no Firestore:', err));
        } catch (e) {}
      }

      this.showToast(`Usuário "${targetUser.nome}" removido com sucesso.`, 'success');
      this.render();
    }
  }

  /* --- Cursos --- */
  renderCursosTable() {
    const tbody = document.getElementById('table-cursos-body');
    if (!tbody) return;

    const activeSchool = this.getActiveSchool();
    const courses = this.state.courses.filter(c => c.schoolId === activeSchool.id);

    if (courses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum curso cadastrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = courses.map(c => `
      <tr>
        <td><span class="badge badge-primary">${this.escapeHTML(c.code)}</span></td>
        <td><strong>${this.escapeHTML(c.name)}</strong></td>
        <td>${this.escapeHTML(c.level)}</td>
        <td><strong style="color:var(--primary);">${c.durationNum} ${this.escapeHTML(c.durationUnit)}</strong></td>
        <td>${c.workload ? `${c.workload} Horas` : 'N/A'}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-primary btn-sm role-access-gestao" onclick="app.editCourse('${c.id}')" title="Editar Dados do Curso">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-secondary btn-sm role-access-gestao" onclick="app.deleteCourse('${c.id}')" title="Excluir Curso">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  openCourseModal() {
    if (!this.checkPermission(['gestao'], 'abrir cadastro de cursos')) return;

    const titleEl = document.getElementById('modal-course-title');
    const saveBtn = document.getElementById('btn-save-course');
    const idInput = document.getElementById('course-id');
    const codeInput = document.getElementById('course-code');
    const nameInput = document.getElementById('course-nome');
    const durNumInput = document.getElementById('course-duracao-num');
    const durTipoInput = document.getElementById('course-duracao-tipo');
    const nivelInput = document.getElementById('course-nivel');
    const cargaInput = document.getElementById('course-carga');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-scroll"></i> Cadastrar Curso';
    if (saveBtn) saveBtn.textContent = 'Salvar Curso';
    if (idInput) idInput.value = '';
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (durNumInput) durNumInput.value = '3';
    if (durTipoInput) durTipoInput.value = 'Anos';
    if (nivelInput) nivelInput.value = 'Graduação';
    if (cargaInput) cargaInput.value = '';

    const critTipo = document.getElementById('course-criterio-tipo');
    const critBox = document.getElementById('course-criterio-custom-box');
    const apInput = document.getElementById('course-nota-aprovacao');
    const exInput = document.getElementById('course-nota-exame');
    if (critTipo) critTipo.value = 'padrao';
    if (critBox) critBox.style.display = 'none';
    if (apInput) apInput.value = '6.0';
    if (exInput) exInput.value = '4.0';

    document.getElementById('modal-course').classList.add('open');
  }

  editCourse(courseId) {
    if (!this.checkPermission(['gestao'], 'editar cursos')) return;

    const course = this.state.courses.find(c => c.id === courseId);
    if (!course) {
      this.showToast('Curso não encontrado para edição.', 'error');
      return;
    }

    const titleEl = document.getElementById('modal-course-title');
    const saveBtn = document.getElementById('btn-save-course');
    const idInput = document.getElementById('course-id');
    const codeInput = document.getElementById('course-code');
    const nameInput = document.getElementById('course-nome');
    const durNumInput = document.getElementById('course-duracao-num');
    const durTipoInput = document.getElementById('course-duracao-tipo');
    const nivelInput = document.getElementById('course-nivel');
    const cargaInput = document.getElementById('course-carga');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Dados do Curso';
    if (saveBtn) saveBtn.textContent = 'Atualizar Curso';
    if (idInput) idInput.value = course.id;
    if (codeInput) codeInput.value = course.code || '';
    if (nameInput) nameInput.value = course.name || '';
    if (durNumInput) durNumInput.value = course.durationNum || 1;
    if (durTipoInput) durTipoInput.value = course.durationUnit || 'Anos';
    if (nivelInput) nivelInput.value = course.level || 'Graduação';
    if (cargaInput) cargaInput.value = course.workload || '';

    const critTipo = document.getElementById('course-criterio-tipo');
    const critBox = document.getElementById('course-criterio-custom-box');
    const apInput = document.getElementById('course-nota-aprovacao');
    const exInput = document.getElementById('course-nota-exame');

    const hasCustomCrit = !!(course.criterioAvaliacao && course.criterioAvaliacao.ativo);
    if (critTipo) critTipo.value = hasCustomCrit ? 'personalizado' : 'padrao';
    if (critBox) critBox.style.display = hasCustomCrit ? 'block' : 'none';
    if (apInput) apInput.value = hasCustomCrit ? course.criterioAvaliacao.notaAprovacao : '6.0';
    if (exInput) exInput.value = hasCustomCrit ? course.criterioAvaliacao.notaExame : '4.0';

    document.getElementById('modal-course').classList.add('open');
  }

  handleSaveCourse(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao'], 'salvar cursos')) return;

    const courseId = document.getElementById('course-id') ? document.getElementById('course-id').value.trim() : '';
    const code = document.getElementById('course-code').value.trim();
    const name = document.getElementById('course-nome').value.trim();
    const durationNum = parseInt(document.getElementById('course-duracao-num').value, 10);
    const durationUnit = document.getElementById('course-duracao-tipo').value;
    const level = document.getElementById('course-nivel').value;
    const workload = parseInt(document.getElementById('course-carga').value, 10) || 0;
    const activeSchool = this.getActiveSchool();

    const critTipo = document.getElementById('course-criterio-tipo')?.value;
    const apVal = parseFloat(document.getElementById('course-nota-aprovacao')?.value);
    const exVal = parseFloat(document.getElementById('course-nota-exame')?.value);
    const criterioObj = critTipo === 'personalizado' ? {
      ativo: true,
      notaAprovacao: !isNaN(apVal) ? apVal : 6.0,
      notaExame: !isNaN(exVal) ? exVal : 4.0
    } : { ativo: false };

    // Validação de código duplicado dentro da mesma escola
    const existingCode = this.state.courses.find(c => 
      c.schoolId === activeSchool.id && 
      c.id !== courseId && 
      c.code.toLowerCase() === code.toLowerCase()
    );
    if (existingCode) {
      this.showToast(`Já existe um curso cadastrado com o código "${code}".`, 'warning', 'Código em Uso');
      return;
    }

    if (courseId) {
      // Modo Edição
      const courseIndex = this.state.courses.findIndex(c => c.id === courseId);
      if (courseIndex >= 0) {
        this.state.courses[courseIndex].code = code;
        this.state.courses[courseIndex].name = name;
        this.state.courses[courseIndex].durationNum = durationNum;
        this.state.courses[courseIndex].durationUnit = durationUnit;
        this.state.courses[courseIndex].level = level;
        this.state.courses[courseIndex].workload = workload;
        this.state.courses[courseIndex].criterioAvaliacao = criterioObj;
        this.state.courses[courseIndex].atualizadoEm = new Date().toISOString();

        this.saveState();
        this.closeModal('modal-course', true);
        this.showToast(`Curso "${name}" atualizado com sucesso!`, 'success');
        this.render();
      } else {
        this.showToast('Erro ao atualizar: curso não localizado.', 'error');
      }
    } else {
      // Modo Novo Cadastro
      const newCourse = {
        id: 'crs_' + Date.now(),
        schoolId: activeSchool.id,
        code, 
        name, 
        durationNum, 
        durationUnit, 
        level, 
        workload,
        criterioAvaliacao: criterioObj,
        criadoEm: new Date().toISOString()
      };

      this.state.courses.push(newCourse);
      this.saveState();
      this.closeModal('modal-course', true);
      this.showToast(`Curso "${name}" criado com sucesso!`, 'success');
      this.render();
    }
  }

  async deleteCourse(id) {
    if (!this.checkPermission(['gestao'], 'excluir cursos')) return;
    const confirmed = await this.confirmAction({
      title: 'Excluir Curso',
      message: 'Deseja excluir este curso? As turmas e vínculos associados a este curso também serão ajustados.',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.courses = this.state.courses.filter(c => c.id !== id);
      // Exclusão em cascata das turmas vinculadas ao curso
      this.state.classes = this.state.classes.filter(t => t.courseId !== id);
      this.saveState();
      this.showToast('Curso excluído com sucesso.', 'success');
      this.render();
    }
  }

  /* --- Disciplinas --- */
  renderDisciplinasTable() {
    const tbody = document.getElementById('table-disciplinas-body');
    if (!tbody) return;

    const activeSchool = this.getActiveSchool();
    const disciplines = this.state.disciplines.filter(d => d.schoolId === activeSchool.id);

    if (disciplines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhuma disciplina cadastrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = disciplines.map(d => `
      <tr>
        <td><span class="badge badge-info">${this.escapeHTML(d.code)}</span></td>
        <td><strong>${this.escapeHTML(d.name)}</strong></td>
        <td><span class="badge badge-warning">${this.escapeHTML(d.periodicity)}</span></td>
        <td>${d.workload}h</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-primary btn-sm role-access-gestao" onclick="app.editDiscipline('${d.id}')" title="Editar Disciplina">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="btn btn-secondary btn-sm role-access-gestao" onclick="app.deleteDiscipline('${d.id}')" title="Excluir Disciplina">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  openDisciplineModal() {
    if (!this.checkPermission(['gestao'], 'abrir cadastro de disciplinas')) return;

    const titleEl = document.getElementById('modal-discipline-title');
    const saveBtn = document.getElementById('btn-save-discipline');
    const idInput = document.getElementById('disc-id');
    const codeInput = document.getElementById('disc-code');
    const nameInput = document.getElementById('disc-nome');
    const periodoInput = document.getElementById('disc-periodo');
    const cargaInput = document.getElementById('disc-carga');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-book-open"></i> Cadastrar Disciplina';
    if (saveBtn) saveBtn.textContent = 'Salvar Disciplina';
    if (idInput) idInput.value = '';
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (periodoInput) periodoInput.value = 'Semestral';
    if (cargaInput) cargaInput.value = '80';

    const critTipo = document.getElementById('disc-criterio-tipo');
    const critBox = document.getElementById('disc-criterio-custom-box');
    const apInput = document.getElementById('disc-nota-aprovacao');
    const exInput = document.getElementById('disc-nota-exame');
    if (critTipo) critTipo.value = 'padrao';
    if (critBox) critBox.style.display = 'none';
    if (apInput) apInput.value = '6.0';
    if (exInput) exInput.value = '4.0';

    document.getElementById('modal-discipline').classList.add('open');
  }

  editDiscipline(disciplineId) {
    if (!this.checkPermission(['gestao'], 'editar disciplinas')) return;

    const disc = this.state.disciplines.find(d => d.id === disciplineId);
    if (!disc) {
      this.showToast('Disciplina não encontrada para edição.', 'error');
      return;
    }

    const titleEl = document.getElementById('modal-discipline-title');
    const saveBtn = document.getElementById('btn-save-discipline');
    const idInput = document.getElementById('disc-id');
    const codeInput = document.getElementById('disc-code');
    const nameInput = document.getElementById('disc-nome');
    const periodoInput = document.getElementById('disc-periodo');
    const cargaInput = document.getElementById('disc-carga');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Disciplina';
    if (saveBtn) saveBtn.textContent = 'Atualizar Disciplina';
    if (idInput) idInput.value = disc.id;
    if (codeInput) codeInput.value = disc.code || '';
    if (nameInput) nameInput.value = disc.name || '';
    if (periodoInput) periodoInput.value = disc.periodicity || 'Semestral';
    if (cargaInput) cargaInput.value = disc.workload || '';

    const critTipo = document.getElementById('disc-criterio-tipo');
    const critBox = document.getElementById('disc-criterio-custom-box');
    const apInput = document.getElementById('disc-nota-aprovacao');
    const exInput = document.getElementById('disc-nota-exame');

    const hasCustomCrit = !!(disc.criterioAvaliacao && disc.criterioAvaliacao.ativo);
    if (critTipo) critTipo.value = hasCustomCrit ? 'personalizado' : 'padrao';
    if (critBox) critBox.style.display = hasCustomCrit ? 'block' : 'none';
    if (apInput) apInput.value = hasCustomCrit ? disc.criterioAvaliacao.notaAprovacao : '6.0';
    if (exInput) exInput.value = hasCustomCrit ? disc.criterioAvaliacao.notaExame : '4.0';

    document.getElementById('modal-discipline').classList.add('open');
  }

  handleSaveDiscipline(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao'], 'salvar disciplinas')) return;

    const discId = document.getElementById('disc-id') ? document.getElementById('disc-id').value.trim() : '';
    const code = document.getElementById('disc-code').value.trim();
    const name = document.getElementById('disc-nome').value.trim();
    const periodicity = document.getElementById('disc-periodo').value;
    const workload = parseInt(document.getElementById('disc-carga').value, 10) || 60;
    const activeSchool = this.getActiveSchool();

    const critTipo = document.getElementById('disc-criterio-tipo')?.value;
    const apVal = parseFloat(document.getElementById('disc-nota-aprovacao')?.value);
    const exVal = parseFloat(document.getElementById('disc-nota-exame')?.value);
    const criterioObj = critTipo === 'personalizado' ? {
      ativo: true,
      notaAprovacao: !isNaN(apVal) ? apVal : 6.0,
      notaExame: !isNaN(exVal) ? exVal : 4.0
    } : { ativo: false };

    // Validação de código duplicado dentro da mesma escola
    const existingCode = this.state.disciplines.find(d => 
      d.schoolId === activeSchool.id && 
      d.id !== discId && 
      d.code.toLowerCase() === code.toLowerCase()
    );
    if (existingCode) {
      this.showToast(`Já existe uma disciplina cadastrada com o código "${code}".`, 'warning', 'Código em Uso');
      return;
    }

    if (discId) {
      // Modo Edição
      const discIndex = this.state.disciplines.findIndex(d => d.id === discId);
      if (discIndex >= 0) {
        this.state.disciplines[discIndex].code = code;
        this.state.disciplines[discIndex].name = name;
        this.state.disciplines[discIndex].periodicity = periodicity;
        this.state.disciplines[discIndex].workload = workload;
        this.state.disciplines[discIndex].criterioAvaliacao = criterioObj;
        this.state.disciplines[discIndex].atualizadoEm = new Date().toISOString();

        this.saveState();
        this.closeModal('modal-discipline', true);
        this.showToast(`Disciplina "${name}" atualizada com sucesso!`, 'success');
        this.render();
      } else {
        this.showToast('Erro ao atualizar: disciplina não localizada.', 'error');
      }
    } else {
      // Modo Novo Cadastro
      const newDisc = {
        id: 'disc_' + Date.now(),
        schoolId: activeSchool.id,
        code, 
        name, 
        periodicity, 
        workload,
        criterioAvaliacao: criterioObj,
        criadoEm: new Date().toISOString()
      };

      this.state.disciplines.push(newDisc);
      this.saveState();
      this.closeModal('modal-discipline', true);
      this.showToast(`Disciplina "${name}" cadastrada com sucesso!`, 'success');
      this.render();
    }
  }

  async deleteDiscipline(id) {
    if (!this.checkPermission(['gestao'], 'excluir disciplinas')) return;
    const confirmed = await this.confirmAction({
      title: 'Excluir Disciplina',
      message: 'Deseja realmente excluir esta disciplina da instituição?',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.disciplines = this.state.disciplines.filter(d => d.id !== id);
      this.state.classes = this.state.classes.filter(t => t.disciplineId !== id);
      this.saveState();
      this.showToast('Disciplina excluída com sucesso.', 'success');
      this.render();
    }
  }

  /* --- Turmas --- */
  renderTurmasTable() {
    const coursesBar = document.getElementById('turmas-courses-bar');
    const viewContainer = document.getElementById('turmas-view-container');
    if (!viewContainer) return;

    this.syncAllSharedDisciplines();

    const activeSchool = this.getActiveSchool();
    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
    const allSchoolTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id);

    const isProfessor = this.currentRole === 'professor';
    let teacherUser = null;
    if (isProfessor) {
      teacherUser = (this.currentUser && this.currentUser.tipo === 'professor')
        ? this.currentUser
        : (this.state.users.find(u => u.tipo === 'professor' && u.schoolId === activeSchool.id) || this.state.users.find(u => u.tipo === 'professor'));
    }

    const isTaughtByTeacher = (td, turma) => {
      if (!isProfessor || !teacherUser) return true;
      if (td && td.teacherId === teacherUser.id) return true;
      if (turma && turma.teacherId === teacherUser.id) return true;
      return false;
    };

    const turmaHasTeacher = (t) => {
      if (!isProfessor || !teacherUser) return true;
      this.ensureTurmaDisciplines(t);
      if (t.teacherId === teacherUser.id) return true;
      const hasNative = (t.disciplines || []).some(d => d.status !== 'arquivada' && (d.teacherId === teacherUser.id || t.teacherId === teacherUser.id));
      if (hasNative) return true;
      for (const otherT of allSchoolTurmas) {
        if (otherT.id !== t.id) {
          this.ensureTurmaDisciplines(otherT);
          const hasShared = (otherT.disciplines || []).some(otherTd =>
            otherTd.status !== 'arquivada' &&
            (otherTd.teacherId === teacherUser.id || otherT.teacherId === teacherUser.id) &&
            Array.isArray(otherTd.sharedWithTurmaIds) &&
            otherTd.sharedWithTurmaIds.includes(t.id)
          );
          if (hasShared) return true;
        }
      }
      return false;
    };

    const relevantSchoolTurmas = isProfessor ? allSchoolTurmas.filter(turmaHasTeacher) : allSchoolTurmas;
    const relevantCourses = isProfessor
      ? schoolCourses.filter(c => relevantSchoolTurmas.some(t => t.courseId === c.id))
      : schoolCourses;

    // 1. Renderizar Seletor Dropdown de Cursos (consistente com as demais abas)
    const courseSelect = document.getElementById('turmas-filter-curso');
    if (courseSelect) {
      if (relevantCourses.length === 0) {
        courseSelect.innerHTML = `<option value="todos">${isProfessor ? 'Nenhum curso associado às suas turmas' : 'Nenhum curso cadastrado ainda'}</option>`;
      } else {
        const isTodos = !this.selectedTurmasCourseId || this.selectedTurmasCourseId === 'todos' || !relevantCourses.some(c => c.id === this.selectedTurmasCourseId);
        let optionsHtml = `<option value="todos" ${isTodos ? 'selected' : ''}>Todos os Cursos (${relevantSchoolTurmas.length} turmas)</option>`;

        relevantCourses.forEach(c => {
          const count = relevantSchoolTurmas.filter(t => t.courseId === c.id).length;
          const isSelected = !isTodos && this.selectedTurmasCourseId === c.id;
          optionsHtml += `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${this.escapeHTML(c.name)} (${count} turma${count !== 1 ? 's' : ''})</option>`;
        });

        courseSelect.innerHTML = optionsHtml;
        if (isTodos) {
          this.selectedTurmasCourseId = 'todos';
        }
      }
    }

    const badgeEl = document.getElementById('turmas-role-context-badge');
    if (badgeEl) {
      badgeEl.innerHTML = isProfessor
        ? `<i class="fa-solid fa-chalkboard-user"></i> Minhas Turmas (${relevantSchoolTurmas.length})`
        : `<i class="fa-solid fa-layer-group"></i> Turmas Ativas (${allSchoolTurmas.length})`;
    }

    // 2. Filtrar Turmas de acordo com o Curso Selecionado
    let filteredTurmas = relevantSchoolTurmas;
    let selectedCourseObj = null;

    if (this.selectedTurmasCourseId && this.selectedTurmasCourseId !== 'todos') {
      filteredTurmas = relevantSchoolTurmas.filter(t => t.courseId === this.selectedTurmasCourseId);
      selectedCourseObj = relevantCourses.find(c => c.id === this.selectedTurmasCourseId);
    }

    // 3. Renderizar Visualização de Turmas (Grid de Cards)
    if (filteredTurmas.length === 0) {
      if (isProfessor) {
        viewContainer.innerHTML = `
          <div class="card" style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-chalkboard-user" style="font-size: 2.5rem; margin-bottom: 0.85rem; opacity: 0.5; color: var(--primary);"></i>
            <h4 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.4rem;">
              ${selectedCourseObj ? `Nenhuma turma atribuída a você no curso "${this.escapeHTML(selectedCourseObj.name)}"` : 'Você não possui turmas ou disciplinas atribuídas no momento'}
            </h4>
            <p style="font-size: 0.9rem; max-width: 480px; margin: 0.5rem auto 0; line-height: 1.5;">
              Quando a gestão ou secretaria vincular seu usuário como professor responsável de uma disciplina ou turma, ela aparecerá automaticamente nesta tela.
            </p>
          </div>
        `;
      } else {
        viewContainer.innerHTML = `
          <div class="card" style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted);">
            <i class="fa-solid fa-layer-group" style="font-size: 2.5rem; margin-bottom: 0.85rem; opacity: 0.4;"></i>
            <h4 style="font-size: 1.15rem; color: var(--text-main); margin-bottom: 0.4rem;">
              ${selectedCourseObj ? `Nenhuma turma formada para o curso "${this.escapeHTML(selectedCourseObj.name)}"` : 'Nenhuma turma formada na instituição'}
            </h4>
            <p style="font-size: 0.9rem; max-width: 480px; margin: 0 auto 1.25rem;">
              Clique no botão abaixo para abrir uma nova turma e iniciar a enturmação de alunos.
            </p>
            <button class="btn btn-primary btn-sm role-access-gestao" onclick="app.openClassModal()">
              <i class="fa-solid fa-plus"></i> Criar Turma
            </button>
          </div>
        `;
      }
      return;
    }

    // Renderizar Cards de Turmas
    viewContainer.innerHTML = `
      <div style="margin-bottom: 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span style="font-size: 0.88rem; color: var(--text-muted);">
          Exibindo <strong>${filteredTurmas.length}</strong> turma(s) ${isProfessor ? 'sob sua regência docente' : ''} ${selectedCourseObj ? `no curso <strong>${this.escapeHTML(selectedCourseObj.name)}</strong>` : ''}
        </span>
      </div>

      <div class="turmas-cards-grid">
        ${filteredTurmas.map(t => {
          this.ensureTurmaDisciplines(t);
          const course = this.state.courses.find(c => c.id === t.courseId);
          const studentCount = t.studentIds ? t.studentIds.length : 0;

          // 1. Disciplinas ativas nativas da turma
          const nativeActiveDiscs = (t.disciplines || []).filter(d => d.status !== 'arquivada');
          const nativeDiscIds = new Set(nativeActiveDiscs.map(d => d.disciplineId));

          // 2. Disciplinas de aula conjunta compartilhadas por outras turmas com esta turma
          const incomingSharedDiscs = [];
          allSchoolTurmas.forEach(otherT => {
            if (otherT.id !== t.id) {
              this.ensureTurmaDisciplines(otherT);
              (otherT.disciplines || []).forEach(otherTd => {
                if (otherTd.status !== 'arquivada' && Array.isArray(otherTd.sharedWithTurmaIds) && otherTd.sharedWithTurmaIds.includes(t.id)) {
                  if (!nativeDiscIds.has(otherTd.disciplineId)) {
                    incomingSharedDiscs.push({
                      td: otherTd,
                      originTurma: otherT
                    });
                  }
                }
              });
            }
          });

          // Filtrar disciplinas para professor (apenas as que ele leciona)
          const displayedNativeDiscs = isProfessor 
            ? nativeActiveDiscs.filter(d => isTaughtByTeacher(d, t))
            : nativeActiveDiscs;

          const displayedIncomingDiscs = isProfessor
            ? incomingSharedDiscs.filter(item => isTaughtByTeacher(item.td, item.originTurma))
            : incomingSharedDiscs;

          const totalDisplayedCount = displayedNativeDiscs.length + displayedIncomingDiscs.length;

          // Renderizar lista de disciplinas (clicáveis para detalhes!)
          let activeDiscsHtml = '';
          if (totalDisplayedCount === 0) {
            activeDiscsHtml = `
              <div style="padding: 0.65rem 0.85rem; background: var(--bg-main); border-radius: 8px; font-size: 0.82rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-circle-info" style="color: var(--primary);"></i> Nenhuma disciplina ativa atribuída neste período.
              </div>
            `;
          } else {
            // Nativas
            const nativeItemsHtml = displayedNativeDiscs.map(td => {
              const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
              const prof = this.state.users.find(u => u.id === td.teacherId) || this.state.users.find(u => u.id === t.teacherId);
              const isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
              const sharedNames = isShared ? td.sharedWithTurmaIds.map(sId => {
                const st = allSchoolTurmas.find(item => item.id === sId);
                return st ? st.nome : '';
              }).filter(Boolean).join(', ') : '';

              const discStudents = this.getEnrolledStudentsForTurmaDiscipline ? this.getEnrolledStudentsForTurmaDiscipline(t.id, td.id) : [];

              return `
                <div class="turma-disc-item" onclick="app.openTurmaDisciplineDetails('${t.id}', '${td.id}')" title="Clique para ver Detalhes (Alunos, Notas, Frequências, Horário e Sala)">
                  <div style="flex: 1; min-width: 0; padding-right: 6px;">
                    <span class="turma-disc-name">${disc ? this.escapeHTML(disc.name) : 'Disciplina'}</span>
                    <div class="turma-disc-meta">
                      ${isShared ? `<span class="turma-disc-tag tag-conjunta"><i class="fa-solid fa-people-arrows"></i> Conjunta</span>` : ''}
                      ${!isProfessor && prof ? `<span><i class="fa-solid fa-chalkboard-user"></i> ${this.escapeHTML(prof.nome)}</span>` : ''}
                      <span><i class="fa-regular fa-calendar"></i> ${this.escapeHTML(td.periodo || 'Atual')}</span>
                      ${discStudents.length > 0 ? `<span>• <i class="fa-solid fa-users"></i> ${discStudents.length} alunos</span>` : ''}
                    </div>
                  </div>
                  <div class="turma-disc-action">
                    <i class="fa-solid fa-chevron-right"></i>
                  </div>
                </div>
              `;
            }).join('');

            // Compartilhadas recebidas
            const incomingItemsHtml = displayedIncomingDiscs.map(item => {
              const disc = this.state.disciplines.find(d => d.id === item.td.disciplineId);
              const prof = this.state.users.find(u => u.id === item.td.teacherId) || this.state.users.find(u => u.id === item.originTurma.teacherId);
              const discStudents = this.getEnrolledStudentsForTurmaDiscipline ? this.getEnrolledStudentsForTurmaDiscipline(t.id, item.td.id) : [];

              return `
                <div class="turma-disc-item" onclick="app.openTurmaDisciplineDetails('${t.id}', '${item.td.id}')" title="Clique para ver Detalhes (Alunos, Notas, Frequências, Horário e Sala)">
                  <div style="flex: 1; min-width: 0; padding-right: 6px;">
                    <span class="turma-disc-name">${disc ? this.escapeHTML(disc.name) : 'Disciplina'}</span>
                    <div class="turma-disc-meta">
                      <span class="turma-disc-tag tag-conjunta"><i class="fa-solid fa-people-arrows"></i> Conjunta (c/ ${this.escapeHTML(item.originTurma.nome)})</span>
                      ${!isProfessor && prof ? `<span><i class="fa-solid fa-chalkboard-user"></i> ${this.escapeHTML(prof.nome)}</span>` : ''}
                      <span><i class="fa-regular fa-calendar"></i> ${this.escapeHTML(item.td.periodo || 'Atual')}</span>
                      ${discStudents.length > 0 ? `<span>• <i class="fa-solid fa-users"></i> ${discStudents.length} alunos</span>` : ''}
                    </div>
                  </div>
                  <div class="turma-disc-action">
                    <i class="fa-solid fa-chevron-right"></i>
                  </div>
                </div>
              `;
            }).join('');

            activeDiscsHtml = nativeItemsHtml + incomingItemsHtml;
          }

          return `
            <div class="turma-overview-card">
              <div>
                <!-- Topo do Card: Identificação da Turma e Alunos -->
                <div class="turma-card-header">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                    <div class="turma-card-icon">
                      <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                    <div style="min-width: 0;">
                      <h3 class="turma-card-title">${this.escapeHTML(t.nome)}</h3>
                      <div class="turma-card-subtitle">
                        ${course ? this.escapeHTML(course.name) : 'Geral'} ${t.turno ? `• ${this.escapeHTML(t.turno)}` : ''}
                        ${t.valorMensalidade ? `• <strong style="color: var(--primary);">R$ ${parseFloat(t.valorMensalidade).toFixed(2)}/mês</strong> (venc. ${t.diaVencimento || 10})` : ''}
                      </div>
                    </div>
                  </div>
                  <div class="turma-card-stats-pill" title="Total de alunos enturmados">
                    <i class="fa-solid fa-users"></i> ${studentCount}
                  </div>
                </div>

                <!-- Lista de Disciplinas -->
                <div style="margin: 0.85rem 0;">
                  <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.45rem;">
                    ${isProfessor ? 'Disciplinas sob sua Regência' : 'Disciplinas'} (${totalDisplayedCount})
                  </div>
                  <div>
                    ${activeDiscsHtml}
                  </div>
                </div>
              </div>

              <!-- Rodapé de Ações do Card -->
              ${isProfessor ? `
                <div class="turma-card-footer">
                  <button type="button" class="turma-card-btn" onclick="app.goToTurmaAulas('${t.id}')">
                    <i class="fa-solid fa-chalkboard-user"></i> Diário & Aulas
                  </button>
                  <button type="button" class="turma-card-btn" onclick="app.goToTurmaHorarios('${t.id}')">
                    <i class="fa-solid fa-clock"></i> Horários
                  </button>
                </div>
              ` : `
                <div class="turma-card-footer">
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn btn-primary btn-sm" onclick="app.openTurmaDisciplinesModal('${t.id}')" title="Gerenciar Disciplinas">
                      <i class="fa-solid fa-book-bookmark"></i> Disciplinas
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="app.openEnrollmentModal('${t.id}')" title="Matricular Alunos">
                      <i class="fa-solid fa-user-graduate"></i> Matrículas
                    </button>
                  </div>
                  <div style="display: flex; gap: 4px;">
                    <button class="btn btn-secondary btn-sm" onclick="app.editTurma('${t.id}')" title="Editar Turma">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="app.deleteTurma('${t.id}')" title="Excluir Turma">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              `}
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.updateNavVisibility();
  }

  handleTurmasCourseChange() {
    const select = document.getElementById('turmas-filter-curso');
    if (select) {
      this.selectedTurmasCourseId = select.value;
      this.renderTurmasTable();
    }
  }

  selectTurmasCourse(courseId) {
    this.selectedTurmasCourseId = courseId;
    const select = document.getElementById('turmas-filter-curso');
    if (select) select.value = courseId;
    this.renderTurmasTable();
  }

  openClassModal() {
    if (!this.checkPermission(['gestao'], 'abrir formação de turmas')) return;

    this.populateSelectDropdowns();

    const titleEl = document.getElementById('modal-class-title');
    const saveBtn = document.getElementById('btn-save-class');
    const idInput = document.getElementById('class-id');
    const nomeInput = document.getElementById('class-nome');
    const turnoSelect = document.getElementById('class-turno');
    const discSelect = document.getElementById('class-disciplina');
    const profSelect = document.getElementById('class-professor');
    const periodoInput = document.getElementById('class-periodo');
    const initialBox = document.getElementById('class-initial-disc-box');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-layer-group"></i> Cadastrar Turma';
    if (saveBtn) saveBtn.textContent = 'Salvar Turma';
    if (idInput) idInput.value = '';
    if (nomeInput) nomeInput.value = '';
    if (turnoSelect) turnoSelect.value = 'Noturno';
    if (discSelect) discSelect.value = '';
    if (profSelect) profSelect.value = '';

    const valMensalInput = document.getElementById('class-valor-mensalidade');
    const diaVencInput = document.getElementById('class-dia-vencimento');
    const mesInicioInput = document.getElementById('class-mes-inicio');
    if (valMensalInput) valMensalInput.value = '';
    if (diaVencInput) diaVencInput.value = '10';
    if (mesInicioInput) mesInicioInput.value = new Date().toISOString().substring(0, 7);

    // Sugerir período letivo atual
    if (periodoInput) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const sem = currentMonth <= 6 ? '1' : '2';
      periodoInput.value = `${currentYear}/${sem}`;
    }

    if (initialBox) initialBox.style.display = 'block';

    document.getElementById('modal-class').classList.add('open');
  }

  editTurma(id) {
    if (!this.checkPermission(['gestao'], 'editar turmas')) return;

    const turma = this.state.classes.find(t => t.id === id);
    if (!turma) {
      this.showToast('Turma não encontrada para edição.', 'error');
      return;
    }

    this.ensureTurmaDisciplines(turma);
    this.populateSelectDropdowns();

    const titleEl = document.getElementById('modal-class-title');
    const saveBtn = document.getElementById('btn-save-class');
    const idInput = document.getElementById('class-id');
    const nomeInput = document.getElementById('class-nome');
    const cursoSelect = document.getElementById('class-curso');
    const turnoSelect = document.getElementById('class-turno');
    const discSelect = document.getElementById('class-disciplina');
    const profSelect = document.getElementById('class-professor');
    const periodoInput = document.getElementById('class-periodo');
    const valMensalInput = document.getElementById('class-valor-mensalidade');
    const diaVencInput = document.getElementById('class-dia-vencimento');
    const mesInicioInput = document.getElementById('class-mes-inicio');
    const initialBox = document.getElementById('class-initial-disc-box');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Dados da Turma';
    if (saveBtn) saveBtn.textContent = 'Atualizar Turma';
    if (idInput) idInput.value = turma.id;
    if (nomeInput) nomeInput.value = turma.nome || '';
    if (cursoSelect) cursoSelect.value = turma.courseId || '';
    if (turnoSelect) turnoSelect.value = turma.turno || 'Noturno';
    if (valMensalInput) valMensalInput.value = turma.valorMensalidade !== undefined ? turma.valorMensalidade : '';
    if (diaVencInput) diaVencInput.value = turma.diaVencimento || '10';
    if (mesInicioInput) mesInicioInput.value = turma.mesInicio || (turma.criadoEm ? turma.criadoEm.substring(0, 7) : new Date().toISOString().substring(0, 7));

    // Se já tiver disciplinas ativas, pega a última cadastrada como referência visual
    const activeDiscs = (turma.disciplines || []).filter(d => d.status !== 'arquivada');
    const primaryTd = activeDiscs[activeDiscs.length - 1];

    if (discSelect) discSelect.value = primaryTd ? primaryTd.disciplineId : (turma.disciplineId || '');
    if (profSelect) profSelect.value = primaryTd ? primaryTd.teacherId : (turma.teacherId || '');
    if (periodoInput) periodoInput.value = primaryTd ? (primaryTd.periodo || '2026/1') : '2026/1';

    if (initialBox) initialBox.style.display = 'block';

    document.getElementById('modal-class').classList.add('open');
  }

  handleSaveClass(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao'], 'salvar turmas')) return;

    const classId = document.getElementById('class-id') ? document.getElementById('class-id').value.trim() : '';
    const nome = document.getElementById('class-nome').value.trim();
    const courseId = document.getElementById('class-curso').value;
    const turno = document.getElementById('class-turno') ? document.getElementById('class-turno').value : 'Noturno';
    const disciplineId = document.getElementById('class-disciplina') ? document.getElementById('class-disciplina').value : '';
    const teacherId = document.getElementById('class-professor') ? document.getElementById('class-professor').value : '';
    const periodo = document.getElementById('class-periodo') ? document.getElementById('class-periodo').value.trim() : '2026/1';
    const valorMensalidade = document.getElementById('class-valor-mensalidade') ? parseFloat(document.getElementById('class-valor-mensalidade').value) || 0 : 0;
    const diaVencimento = document.getElementById('class-dia-vencimento') ? parseInt(document.getElementById('class-dia-vencimento').value, 10) || 10 : 10;
    const mesInicio = document.getElementById('class-mes-inicio') ? document.getElementById('class-mes-inicio').value.trim() : '';
    const activeSchool = this.getActiveSchool();

    if (!nome) {
      this.showToast('Informe o nome da turma.', 'warning');
      return;
    }
    if (!courseId) {
      this.showToast('Selecione o curso vinculado à turma.', 'warning');
      return;
    }

    if (classId) {
      // Modo Edição
      const turma = this.state.classes.find(t => t.id === classId);
      if (turma) {
        this.ensureTurmaDisciplines(turma);
        turma.nome = nome;
        turma.courseId = courseId;
        turma.turno = turno;
        turma.valorMensalidade = valorMensalidade;
        turma.diaVencimento = diaVencimento;
        turma.mesInicio = mesInicio || turma.mesInicio || (turma.criadoEm ? turma.criadoEm.substring(0, 7) : new Date().toISOString().substring(0, 7));

        // Se uma disciplina foi selecionada, atualiza ou adiciona na lista de disciplinas da turma
        if (disciplineId) {
          turma.disciplineId = disciplineId;
          turma.teacherId = teacherId || null;

          const existingTd = turma.disciplines.find(d => d.disciplineId === disciplineId && d.status !== 'arquivada');
          if (existingTd) {
            existingTd.teacherId = teacherId || null;
            if (periodo) existingTd.periodo = periodo;
          } else {
            turma.disciplines.push({
              id: 'td_' + Date.now(),
              disciplineId,
              teacherId: teacherId || null,
              periodo: periodo || '2026/1',
              status: 'ativa',
              criadoEm: new Date().toISOString()
            });
          }
        }
        turma.atualizadoEm = new Date().toISOString();

        this.saveState();
        this.closeModal('modal-class', true);
        this.showToast(`Turma "${nome}" atualizada com sucesso!`, 'success');
        this.render();
      } else {
        this.showToast('Erro ao atualizar: turma não localizada.', 'error');
      }
    } else {
      // Modo Novo Cadastro
      // Auto enturmar todos os alunos cadastrados com o curso selecionado
      const studentsInCourse = this.state.users.filter(u => u.tipo === 'aluno' && u.schoolId === activeSchool.id && u.cursoId === courseId).map(u => u.id);

      const initialDisciplines = [];
      if (disciplineId) {
        initialDisciplines.push({
          id: 'td_' + Date.now(),
          disciplineId,
          teacherId: teacherId || null,
          periodo: periodo || '2026/1',
          status: 'ativa',
          criadoEm: new Date().toISOString()
        });
      }

      const newTurma = {
        id: 'turma_' + Date.now(),
        schoolId: activeSchool.id,
        nome, 
        courseId, 
        turno,
        valorMensalidade,
        diaVencimento,
        mesInicio: mesInicio || new Date().toISOString().substring(0, 7),
        studentDiscounts: {},
        payments: {},
        disciplineId: disciplineId || null, 
        teacherId: teacherId || null,
        studentIds: studentsInCourse,
        disciplines: initialDisciplines,
        criadoEm: new Date().toISOString()
      };

      this.state.classes.push(newTurma);
      this.saveState();
      this.closeModal('modal-class', true);
      
      const discCountMsg = initialDisciplines.length > 0 ? ' com 1 disciplina vinculada' : '';
      this.showToast(`Turma "${nome}" criada com sucesso${discCountMsg}! ${studentsInCourse.length} aluno(s) enturmado(s).`, 'success');
      this.render();
    }
  }

  /* --- Matrículas & Enturmação Manual --- */
  openEnrollmentModal(turmaId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'gerenciar matrículas da turma')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não localizada.', 'error');
      return;
    }

    const activeSchool = this.getActiveSchool();
    const course = this.state.courses.find(c => c.id === turma.courseId);
    const disc = this.state.disciplines.find(d => d.id === turma.disciplineId);
    const teacher = this.state.users.find(u => u.id === turma.teacherId);

    // Identificação da turma
    document.getElementById('enrollment-turma-id').value = turma.id;
    const infoEl = document.getElementById('enrollment-turma-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);"><i class="fa-solid fa-layer-group"></i> ${this.escapeHTML(turma.nome)}</div>
        <div style="margin-top: 4px; color: var(--text-muted);">
          <span><strong>Curso:</strong> ${course ? this.escapeHTML(course.name) : 'Geral'}</span> • 
          <span><strong>Disciplina:</strong> ${disc ? this.escapeHTML(disc.name) : 'Geral'}</span> • 
          <span><strong>Professor:</strong> ${teacher ? this.escapeHTML(teacher.nome) : 'Não atribuído'}</span>
        </div>
      `;
    }

    // Limpar busca
    const searchInput = document.getElementById('enrollment-search');
    if (searchInput) searchInput.value = '';

    // Buscar alunos da escola
    const allStudents = this.state.users.filter(u => u.tipo === 'aluno' && u.schoolId === activeSchool.id);
    const listEl = document.getElementById('enrollment-students-list');

    if (allStudents.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-user-slash" style="font-size: 1.5rem; margin-bottom: 6px;"></i><br>
          Nenhum aluno cadastrado nesta instituição ainda.<br>
          Cadastre alunos na aba <strong>Usuários & RAs</strong> para matriculá-los aqui.
        </div>
      `;
      this.updateEnrollmentCount();
      document.getElementById('modal-enrollment').classList.add('open');
      return;
    }

    const enrolledSet = new Set(turma.studentIds || []);

    // Ordenar alunos: primeiro os matriculados, depois por nome
    const sortedStudents = [...allStudents].sort((a, b) => {
      const aIn = enrolledSet.has(a.id) ? 1 : 0;
      const bIn = enrolledSet.has(b.id) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return a.nome.localeCompare(b.nome);
    });

    listEl.innerHTML = sortedStudents.map(st => {
      const isEnrolled = enrolledSet.has(st.id);
      const studentCurso = this.state.courses.find(c => c.id === st.cursoId);

      return `
        <label class="enrollment-student-item ${isEnrolled ? 'selected' : ''}" data-student-id="${st.id}" data-name="${this.escapeHTML(st.nome).toLowerCase()}" data-ra="${this.escapeHTML(st.ra || '').toLowerCase()}">
          <div style="display: flex; align-items: center;">
            <input type="checkbox" class="enrollment-checkbox" value="${st.id}" ${isEnrolled ? 'checked' : ''} onchange="app.handleEnrollmentCheckboxChange(this)">
            <div>
              <div style="font-weight: 600; color: var(--text-main);">${this.escapeHTML(st.nome)}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                RA: <span class="ra-badge">${this.escapeHTML(st.ra || 'S/ RA')}</span>
                ${studentCurso ? ` • <span style="color: var(--primary);">${this.escapeHTML(studentCurso.name)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="enrollment-status-badge">
            ${isEnrolled 
              ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Matriculado</span>` 
              : `<span class="badge" style="background:var(--bg-card-secondary, rgba(0,0,0,0.06)); color:var(--text-muted);">Não enturmado</span>`}
          </div>
        </label>
      `;
    }).join('');

    this.updateEnrollmentCount();
    document.getElementById('modal-enrollment').classList.add('open');
  }

  handleEnrollmentCheckboxChange(checkbox) {
    const item = checkbox.closest('.enrollment-student-item');
    if (!item) return;

    const badgeContainer = item.querySelector('.enrollment-status-badge');
    if (checkbox.checked) {
      item.classList.add('selected');
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Matriculado</span>`;
      }
    } else {
      item.classList.remove('selected');
      if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="badge" style="background:var(--bg-card-secondary, rgba(0,0,0,0.06)); color:var(--text-muted);">Não enturmado</span>`;
      }
    }

    this.updateEnrollmentCount();
  }

  updateEnrollmentCount() {
    const countEl = document.getElementById('enrollment-selected-count');
    if (countEl) {
      const checked = document.querySelectorAll('#enrollment-students-list input.enrollment-checkbox:checked').length;
      countEl.textContent = checked;
    }
  }

  selectAllEnrollment(select) {
    const items = document.querySelectorAll('#enrollment-students-list .enrollment-student-item');
    items.forEach(item => {
      if (item.style.display !== 'none') {
        const cb = item.querySelector('input.enrollment-checkbox');
        if (cb) {
          cb.checked = select;
          this.handleEnrollmentCheckboxChange(cb);
        }
      }
    });
    this.updateEnrollmentCount();
  }

  filterEnrollmentList() {
    const searchInput = document.getElementById('enrollment-search');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const items = document.querySelectorAll('#enrollment-students-list .enrollment-student-item');

    items.forEach(item => {
      const name = item.getAttribute('data-name') || '';
      const ra = item.getAttribute('data-ra') || '';
      if (!query || name.includes(query) || ra.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  saveEnrollment() {
    if (!this.checkPermission(['gestao', 'secretaria'], 'salvar matrículas')) return;

    const turmaId = document.getElementById('enrollment-turma-id').value;
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não encontrada para salvar matrículas.', 'error');
      return;
    }

    const checkboxes = document.querySelectorAll('#enrollment-students-list input.enrollment-checkbox:checked');
    const selectedStudentIds = Array.from(checkboxes).map(cb => cb.value);

    turma.studentIds = selectedStudentIds;
    turma.atualizadoEm = new Date().toISOString();

    this.saveState();
    this.closeModal('modal-enrollment');
    this.showToast(`Matrículas salvas com sucesso! A turma "${turma.nome}" agora possui ${selectedStudentIds.length} aluno(s).`, 'success');
    this.render();
  }

  async deleteTurma(id) {
    if (!this.checkPermission(['gestao'], 'excluir turmas')) return;
    const confirmed = await this.confirmAction({
      title: 'Remover Turma',
      message: 'Deseja realmente remover esta turma e seus vínculos?',
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.classes = this.state.classes.filter(t => t.id !== id);
      this.saveState();
      this.showToast('Turma removida com sucesso.', 'success');
      this.render();
    }
  }

  /* --- Multi-Disciplinas & Arquivamento por Turma --- */
  openTurmaDisciplinesModal(turmaId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'gerenciar disciplinas da turma')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não encontrada.', 'error');
      return;
    }

    this.ensureTurmaDisciplines(turma);
    const activeSchool = this.getActiveSchool();
    const course = this.state.courses.find(c => c.id === turma.courseId);

    // Salvar ID no input oculto
    const idInput = document.getElementById('turma-disc-turma-id');
    if (idInput) idInput.value = turma.id;

    // Cabeçalho / Identificação da Turma
    const infoEl = document.getElementById('turma-disc-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main); display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-layer-group" style="color:var(--primary);"></i> ${this.escapeHTML(turma.nome)}
        </div>
        <div style="margin-top: 5px; color: var(--text-muted); font-size: 0.88rem;">
          <span><strong>Curso:</strong> ${course ? this.escapeHTML(course.name) : 'Geral'}</span> • 
          <span><strong>Alunos Matriculados:</strong> ${turma.studentIds ? turma.studentIds.length : 0}</span>
        </div>
      `;
    }

    // Popular selects do formulário de adição rápida
    const discSelect = document.getElementById('new-turma-disc-select');
    if (discSelect) {
      const schoolDiscs = this.state.disciplines.filter(d => d.schoolId === activeSchool.id);
      discSelect.innerHTML = `<option value="">Selecione a disciplina...</option>` + 
        schoolDiscs.map(d => `<option value="${d.id}">${this.escapeHTML(d.code)} - ${this.escapeHTML(d.name)}</option>`).join('');
    }

    const profSelect = document.getElementById('new-turma-prof-select');
    if (profSelect) {
      const profs = this.state.users.filter(u => u.tipo === 'professor' && u.schoolId === activeSchool.id);
      profSelect.innerHTML = `<option value="">Selecione o professor...</option>` + 
        profs.map(p => `<option value="${p.id}">${this.escapeHTML(p.nome)}</option>`).join('');
    }

    // Período padrão sugerido
    const periodInput = document.getElementById('new-turma-period-input');
    if (periodInput) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const sem = currentMonth <= 6 ? '1' : '2';
      periodInput.value = `${currentYear}/${sem}`;
    }

    // Resetar aba para 'ativas'
    this.switchTurmaDiscModalTab('ativas');

    // Renderizar listas
    this.renderTurmaDisciplinesLists(turma);

    document.getElementById('modal-turma-disciplines').classList.add('open');
  }

  switchTurmaDiscModalTab(tab) {
    const btnAtivas = document.getElementById('tab-btn-turma-disc-ativas');
    const btnArquivadas = document.getElementById('tab-btn-turma-disc-arquivadas');
    const paneAtivas = document.getElementById('pane-turma-disc-ativas');
    const paneArquivadas = document.getElementById('pane-turma-disc-arquivadas');

    if (tab === 'ativas') {
      if (btnAtivas) {
        btnAtivas.classList.remove('btn-secondary');
        btnAtivas.classList.add('btn-primary');
      }
      if (btnArquivadas) {
        btnArquivadas.classList.remove('btn-primary');
        btnArquivadas.classList.add('btn-secondary');
      }
      if (paneAtivas) paneAtivas.style.display = 'block';
      if (paneArquivadas) paneArquivadas.style.display = 'none';
    } else {
      if (btnArquivadas) {
        btnArquivadas.classList.remove('btn-secondary');
        btnArquivadas.classList.add('btn-primary');
      }
      if (btnAtivas) {
        btnAtivas.classList.remove('btn-primary');
        btnAtivas.classList.add('btn-secondary');
      }
      if (paneAtivas) paneAtivas.style.display = 'none';
      if (paneArquivadas) paneArquivadas.style.display = 'block';
    }
  }

  renderTurmaDisciplinesLists(turma) {
    if (!turma) return;
    this.syncAllSharedDisciplines();
    this.ensureTurmaDisciplines(turma);

    const listAtivas = document.getElementById('list-turma-disc-ativas');
    const listArquivadas = document.getElementById('list-turma-disc-arquivadas');
    const countAtivas = document.getElementById('turma-disc-count-ativas');
    const countArquivadas = document.getElementById('turma-disc-count-arquivadas');

    const ativas = (turma.disciplines || []).filter(d => d.status !== 'arquivada');
    const arquivadas = (turma.disciplines || []).filter(d => d.status === 'arquivada');

    if (countAtivas) countAtivas.textContent = ativas.length;
    if (countArquivadas) countArquivadas.textContent = arquivadas.length;

    // Renderizar Ativas
    if (listAtivas) {
      const activeSchool = this.getActiveSchool();
      const allSchoolTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id);
      const nativeDiscIds = new Set(ativas.map(d => d.disciplineId));
      const incomingShared = [];

      allSchoolTurmas.forEach(otherT => {
        if (otherT.id !== turma.id) {
          this.ensureTurmaDisciplines(otherT);
          (otherT.disciplines || []).forEach(otherTd => {
            if (otherTd.status !== 'arquivada' && Array.isArray(otherTd.sharedWithTurmaIds) && otherTd.sharedWithTurmaIds.includes(turma.id)) {
              if (!nativeDiscIds.has(otherTd.disciplineId)) {
                incomingShared.push({
                  td: otherTd,
                  originTurma: otherT
                });
              }
            }
          });
        }
      });

      if (countAtivas) countAtivas.textContent = ativas.length + incomingShared.length;

      if (ativas.length === 0 && incomingShared.length === 0) {
        listAtivas.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 8px;">
            <i class="fa-solid fa-book-open" style="font-size: 1.5rem; margin-bottom: 6px; opacity: 0.6;"></i><br>
            Nenhuma disciplina ativa vinculada a esta turma no momento.<br>
            Adicione uma disciplina acima para iniciar as aulas deste período.
          </div>
        `;
      } else {
        const nativeHtml = ativas.map(td => {
          const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
          const prof = this.state.users.find(u => u.id === td.teacherId);
          const totalTurmaStudents = (turma.studentIds || []).length;
          
          let matCount = 0;
          let dispCount = 0;
          let naoMatCount = 0;

          (turma.studentIds || []).forEach(sId => {
            let st = 'matriculado';
            if (td.studentStatuses && typeof td.studentStatuses === 'object' && td.studentStatuses[sId]) {
              st = td.studentStatuses[sId];
            } else if (Array.isArray(td.studentIds)) {
              st = td.studentIds.includes(sId) ? 'matriculado' : 'dispensado';
            }
            if (st === 'matriculado') matCount++;
            else if (st === 'dispensado') dispCount++;
            else naoMatCount++;
          });

          const isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
          const sharedNames = isShared ? td.sharedWithTurmaIds.map(sId => {
            const st = allSchoolTurmas.find(item => item.id === sId);
            return st ? st.nome : '';
          }).filter(Boolean).join(', ') : '';

          return `
            <div class="turma-disc-item" style="margin-bottom: 8px;">
              <div style="flex: 1; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Em Andamento</span>
                  <span class="badge badge-primary"><i class="fa-solid fa-calendar-week"></i> Período: ${this.escapeHTML(td.periodo || 'Atual')}</span>
                  <span class="badge ${matCount < totalTurmaStudents ? 'badge-warning' : 'badge-info'}" title="Alunos cursando normalmente">
                    <i class="fa-solid fa-user-check"></i> ${matCount}/${totalTurmaStudents} Matriculados
                  </span>
                  ${dispCount > 0 ? `<span class="badge badge-warning" title="Alunos com dispensa"><i class="fa-solid fa-award"></i> ${dispCount} Dispensado(s)</span>` : ''}
                  ${naoMatCount > 0 ? `<span class="badge badge-secondary" title="Alunos não matriculados"><i class="fa-solid fa-user-slash"></i> ${naoMatCount} Não Matriculado(s)</span>` : ''}
                  ${isShared ? `<span class="badge" style="background:#6366f1; color:#fff;" title="Aula conjunta com ${this.escapeHTML(sharedNames)}"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta (c/ ${this.escapeHTML(sharedNames)})</span>` : ''}
                </div>
                <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main); margin-top: 6px;">
                  ${disc ? this.escapeHTML(disc.name) : 'Disciplina não encontrada'}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
                  <span><i class="fa-solid fa-chalkboard-user"></i> Professor: <strong style="color:var(--text-main);">${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</strong></span>
                  ${disc ? ` • Carga: ${disc.workload || 60}h` : ''}
                </div>
              </div>

              <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm role-access-gestao role-access-secretaria" onclick="app.openTurmaGradingScaleModal('${turma.id}', '${td.id}')" title="Configurar critérios de aprovação/exame desta disciplina nesta turma">
                  <i class="fa-solid fa-sliders"></i> Critério
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.openDisciplineStudentsModal('${turma.id}', '${td.id}')" title="Gerenciar situação dos alunos (Matriculado, Dispensado ou Não Matriculado)">
                  <i class="fa-solid fa-users-gear"></i> Alunos (${matCount})
                </button>
                <button type="button" class="btn ${isShared ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="app.openSharedDisciplineModal('${turma.id}', '${td.id}')" title="Configurar aula conjunta com outras turmas">
                  <i class="fa-solid fa-people-arrows"></i> Aula Conjunta ${isShared ? `(${td.sharedWithTurmaIds.length})` : ''}
                </button>
                <button type="button" class="btn btn-warning btn-sm" onclick="app.handleArchiveTurmaDiscipline('${turma.id}', '${td.id}')" title="Arquivar disciplina ao concluir o semestre">
                  <i class="fa-solid fa-box-archive"></i> Arquivar
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.handleRemoveTurmaDiscipline('${turma.id}', '${td.id}')" title="Remover vínculo da disciplina">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');

        const incomingHtml = incomingShared.map(item => {
          const disc = this.state.disciplines.find(d => d.id === item.td.disciplineId);
          const prof = this.state.users.find(u => u.id === item.td.teacherId);
          const totalTurmaStudents = (turma.studentIds || []).length;
          return `
            <div class="turma-disc-item" style="margin-bottom: 8px;">
              <div style="flex: 1; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Em Andamento</span>
                  <span class="badge badge-primary"><i class="fa-solid fa-calendar-week"></i> Período: ${this.escapeHTML(item.td.periodo || 'Atual')}</span>
                  <span class="badge" style="background:#6366f1; color:#fff;"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta (c/ ${this.escapeHTML(item.originTurma.nome)})</span>
                </div>
                <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main); margin-top: 6px;">
                  ${disc ? this.escapeHTML(disc.name) : 'Disciplina'}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
                  <span><i class="fa-solid fa-chalkboard-user"></i> Professor: <strong style="color:var(--text-main);">${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</strong></span>
                  ${disc ? ` • Carga: ${disc.workload || 60}h` : ''}
                </div>
              </div>

              <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm role-access-gestao role-access-secretaria" onclick="app.openTurmaGradingScaleModal('${turma.id}', '${item.td.id}')" title="Configurar critérios de aprovação/exame desta disciplina nesta turma">
                  <i class="fa-solid fa-sliders"></i> Critério
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.openDisciplineStudentsModal('${turma.id}', '${item.td.id}')" title="Gerenciar situação dos alunos desta turma">
                  <i class="fa-solid fa-users-gear"></i> Alunos (${totalTurmaStudents})
                </button>
                <button type="button" class="btn btn-primary btn-sm" onclick="app.openSharedDisciplineModal('${turma.id}', '${item.td.id}')" title="Configurar aula conjunta com outras turmas">
                  <i class="fa-solid fa-people-arrows"></i> Aula Conjunta
                </button>
              </div>
            </div>
          `;
        }).join('');

        listAtivas.innerHTML = nativeHtml + incomingHtml;
      }
    }

    // Renderizar Arquivadas
    if (listArquivadas) {
      if (arquivadas.length === 0) {
        listArquivadas.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 8px;">
            <i class="fa-solid fa-box-archive" style="font-size: 1.5rem; margin-bottom: 6px; opacity: 0.6;"></i><br>
            Nenhuma disciplina arquivada nesta turma.<br>
            Ao término do semestre ou período, clique em <strong>Arquivar / Concluir</strong> para fechar o ciclo preservando notas e histórico.
          </div>
        `;
      } else {
        listArquivadas.innerHTML = arquivadas.map(td => {
          const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
          const prof = this.state.users.find(u => u.id === td.teacherId);
          const dataArq = td.arquivadoEm ? new Date(td.arquivadoEm).toLocaleDateString('pt-BR') : '';

          return `
            <div class="turma-disc-item archived">
              <div style="flex: 1; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge" style="background: var(--bg-card-secondary, rgba(0,0,0,0.06)); color: var(--text-muted);"><i class="fa-solid fa-box-archive"></i> Histórico / Concluída</span>
                  <span class="badge badge-secondary"><i class="fa-solid fa-calendar-check"></i> Período: ${this.escapeHTML(td.periodo || 'Anterior')}</span>
                  ${dataArq ? `<span style="font-size: 0.75rem; color: var(--text-muted);">Arquivada em: ${dataArq}</span>` : ''}
                </div>
                <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main); margin-top: 6px; text-decoration: line-through; opacity: 0.85;">
                  ${disc ? this.escapeHTML(disc.name) : 'Disciplina'}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">
                  <span><i class="fa-solid fa-chalkboard-user"></i> Professor: ${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</span>
                </div>
              </div>

              <div style="display: flex; gap: 6px; align-items: center;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.handleReactivateTurmaDiscipline('${turma.id}', '${td.id}')" title="Reativar disciplina caso precise lançar correções ou notas">
                  <i class="fa-solid fa-rotate-left"></i> Reativar
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.handleRemoveTurmaDiscipline('${turma.id}', '${td.id}')" title="Remover definitivamente registro">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  handleAddTurmaDiscipline(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao', 'secretaria'], 'adicionar disciplina à turma')) return;

    const turmaId = document.getElementById('turma-disc-turma-id').value;
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não localizada.', 'error');
      return;
    }

    this.ensureTurmaDisciplines(turma);

    const discId = document.getElementById('new-turma-disc-select').value;
    const profId = document.getElementById('new-turma-prof-select').value;
    const periodo = document.getElementById('new-turma-period-input').value.trim();

    if (!discId) {
      this.showToast('Selecione a disciplina.', 'warning');
      return;
    }
    if (!profId) {
      this.showToast('Selecione o professor responsável.', 'warning');
      return;
    }
    if (!periodo) {
      this.showToast('Informe o período letivo (ex: 2026/1).', 'warning');
      return;
    }

    // Verificar se a disciplina já está ativa nesta turma no mesmo período
    const alreadyActive = turma.disciplines.some(d => d.disciplineId === discId && d.status !== 'arquivada' && d.periodo === periodo);
    if (alreadyActive) {
      this.showToast('Esta disciplina já está vinculada e ativa nesta turma para este período.', 'warning');
      return;
    }

    const newTd = {
      id: 'td_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      disciplineId: discId,
      teacherId: profId,
      periodo: periodo,
      status: 'ativa',
      criadoEm: new Date().toISOString()
    };

    turma.disciplines.push(newTd);
    
    // Atualizar dados legados para manter compatibilidade retroativa com códigos externos
    turma.disciplineId = discId;
    turma.teacherId = profId;
    turma.atualizadoEm = new Date().toISOString();

    this.saveState();
    this.renderTurmaDisciplinesLists(turma);
    this.populateSelectDropdowns();
    this.renderTurmasTable();

    const discObj = this.state.disciplines.find(d => d.id === discId);
    this.showToast(`Disciplina "${discObj ? discObj.name : ''}" vinculada com sucesso à turma "${turma.nome}"!`, 'success');
  }

  async handleArchiveTurmaDiscipline(turmaId, tdId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'arquivar disciplina da turma')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return;
    this.ensureTurmaDisciplines(turma);

    const td = turma.disciplines.find(d => d.id === tdId);
    if (!td) return;

    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);

    const confirmed = await this.confirmAction({
      title: 'Arquivar Disciplina da Turma',
      message: `Deseja arquivar a disciplina "${disc ? disc.name : 'esta disciplina'}" (Período: ${td.periodo || 'Atual'})?\n\nOs registros históricos, notas e presenças continuarão preservados. A disciplina passará para a aba de Histórico.`,
      confirmText: 'Sim, Arquivar',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (confirmed) {
      td.status = 'arquivada';
      td.arquivadoEm = new Date().toISOString();
      turma.atualizadoEm = new Date().toISOString();

      this.saveState();
      this.renderTurmaDisciplinesLists(turma);
      this.populateSelectDropdowns();
      this.renderTurmasTable();
      this.showToast(`Disciplina arquivada com sucesso! Todo o histórico foi mantido.`, 'success');
    }
  }

  async handleReactivateTurmaDiscipline(turmaId, tdId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'reativar disciplina da turma')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return;
    this.ensureTurmaDisciplines(turma);

    const td = turma.disciplines.find(d => d.id === tdId);
    if (!td) return;

    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);

    const confirmed = await this.confirmAction({
      title: 'Reativar Disciplina da Turma',
      message: `Deseja reativar a disciplina "${disc ? disc.name : 'esta disciplina'}" para a lista de disciplinas em andamento?`,
      confirmText: 'Sim, Reativar',
      cancelText: 'Cancelar',
      type: 'primary'
    });

    if (confirmed) {
      td.status = 'ativa';
      delete td.arquivadoEm;
      turma.atualizadoEm = new Date().toISOString();

      this.saveState();
      this.renderTurmaDisciplinesLists(turma);
      this.populateSelectDropdowns();
      this.renderTurmasTable();
      this.showToast(`Disciplina reativada com sucesso!`, 'success');
    }
  }

  async handleRemoveTurmaDiscipline(turmaId, tdId) {
    if (!this.checkPermission(['gestao'], 'remover disciplina da turma')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return;
    this.ensureTurmaDisciplines(turma);

    const td = turma.disciplines.find(d => d.id === tdId);
    if (!td) return;

    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);

    const confirmed = await this.confirmAction({
      title: 'Remover Vínculo de Disciplina',
      message: `Tem certeza que deseja remover o vínculo da disciplina "${disc ? disc.name : 'esta disciplina'}" com a turma?\n\n(Dica: se a disciplina já foi cursada no passado, prefira a opção "Arquivar" para manter o histórico).`,
      confirmText: 'Sim, Remover Vínculo',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      if (Array.isArray(td.sharedWithTurmaIds)) {
        td.sharedWithTurmaIds.forEach(oId => {
          const oTurma = this.state.classes.find(t => t.id === oId);
          if (oTurma && oTurma.disciplines) {
            const matchTd = oTurma.disciplines.find(d => d.disciplineId === td.disciplineId);
            if (matchTd && Array.isArray(matchTd.sharedWithTurmaIds)) {
              matchTd.sharedWithTurmaIds = matchTd.sharedWithTurmaIds.filter(id => id !== turma.id);
              oTurma.atualizadoEm = new Date().toISOString();
            }
          }
        });
      }

      turma.disciplines = turma.disciplines.filter(d => d.id !== tdId);
      turma.atualizadoEm = new Date().toISOString();

      this.saveState();
      this.renderTurmaDisciplinesLists(turma);
      this.populateSelectDropdowns();
      this.renderTurmasTable();
      this.showToast('Vínculo da disciplina removido.', 'success');
    }
  }

  /* --- Gestão de Matrículas por Disciplina (Dispensas / DPs) --- */
  openDisciplineStudentsModal(turmaId, tdId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'gerenciar alunos da disciplina')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não encontrada.', 'error');
      return;
    }
    this.ensureTurmaDisciplines(turma);

    const td = (turma.disciplines || []).find(d => d.id === tdId);
    if (!td) {
      this.showToast('Disciplina não encontrada nesta turma.', 'error');
      return;
    }

    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
    const prof = this.state.users.find(u => u.id === td.teacherId);
    const course = this.state.courses.find(c => c.id === turma.courseId);

    const inputTurmaId = document.getElementById('disc-students-turma-id');
    const inputTdId = document.getElementById('disc-students-td-id');
    if (inputTurmaId) inputTurmaId.value = turma.id;
    if (inputTdId) inputTdId.value = td.id;

    const infoBox = document.getElementById('disc-students-info-box');
    if (infoBox) {
      infoBox.innerHTML = `
        <div style="font-weight:700; font-size:1rem; color:var(--text-main); display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-book-open" style="color:var(--primary);"></i> ${disc ? this.escapeHTML(disc.name) : 'Disciplina'}
          <span class="badge badge-primary" style="font-size:0.75rem;">Período: ${this.escapeHTML(td.periodo || 'Atual')}</span>
        </div>
        <div style="margin-top:6px; color:var(--text-muted); font-size:0.85rem; display:flex; flex-wrap:wrap; gap:12px;">
          <span><strong>Turma:</strong> ${this.escapeHTML(turma.nome)}</span>
          <span><strong>Curso:</strong> ${course ? this.escapeHTML(course.name) : 'Geral'}</span>
          <span><strong>Professor:</strong> ${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</span>
        </div>
      `;
    }

    const container = document.getElementById('disc-students-checkboxes-container');
    if (container) {
      const turmaStudents = (turma.studentIds || []).map(sId => this.state.users.find(u => u.id === sId)).filter(Boolean);

      if (turmaStudents.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:1.5rem; color:var(--text-muted);">
            <i class="fa-solid fa-user-xmark" style="font-size:1.8rem; opacity:0.5; margin-bottom:6px;"></i>
            <p style="margin:0; font-size:0.88rem;">Nenhum aluno matriculado na turma geral <strong>${this.escapeHTML(turma.nome)}</strong>.</p>
            <p style="margin-top:4px; font-size:0.8rem;">Adicione alunos à turma no botão "Matrículas" do card da turma.</p>
          </div>
        `;
      } else {
        const getStudentStatus = (sId) => {
          if (td.studentStatuses && typeof td.studentStatuses === 'object' && td.studentStatuses[sId]) {
            return td.studentStatuses[sId];
          }
          if (Array.isArray(td.studentIds)) {
            return td.studentIds.includes(sId) ? 'matriculado' : 'dispensado';
          }
          return 'matriculado';
        };

        container.innerHTML = turmaStudents.map(aluno => {
          const status = getStudentStatus(aluno.id);
          const isMatriculado = status === 'matriculado';
          const isDispensado = status === 'dispensado';
          const isNaoMatriculado = status === 'nao_matriculado';

          let bg = 'transparent';
          let borderLeft = '3px solid var(--success)';
          if (isDispensado) {
            bg = 'rgba(245, 158, 11, 0.05)';
            borderLeft = '3px solid var(--warning)';
          } else if (isNaoMatriculado) {
            bg = 'var(--bg-card-secondary, rgba(0,0,0,0.03))';
            borderLeft = '3px solid var(--border-color)';
          }

          return `
            <div class="discipline-student-row" id="disc-student-row-${aluno.id}" style="display:flex; align-items:center; justify-content:space-between; padding:0.65rem 0.85rem; border-bottom:1px solid var(--border-color); background:${bg}; border-left:${borderLeft}; border-radius:6px; margin-bottom:5px; transition:all 0.2s; flex-wrap:wrap; gap:8px;">
              <div style="flex:1; min-width:200px;">
                <div style="font-weight:700; font-size:0.92rem; color:var(--text-main);">${this.escapeHTML(aluno.nome)}</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                  RA: <span class="ra-badge">${aluno.ra || '-'}</span> • ${this.escapeHTML(aluno.email || '')}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <select class="form-control form-control-sm disc-student-status-select" 
                        data-student-id="${aluno.id}" 
                        onchange="app.handleDisciplineStudentStatusChange(this)"
                        style="font-size:0.82rem; font-weight:600; min-width:170px; border-radius:6px; cursor:pointer; height:34px;">
                  <option value="matriculado" ${isMatriculado ? 'selected' : ''}>✅ Matriculado</option>
                  <option value="dispensado" ${isDispensado ? 'selected' : ''}>🟡 Dispensado</option>
                  <option value="nao_matriculado" ${isNaoMatriculado ? 'selected' : ''}>⚪ Não Matriculado</option>
                </select>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    document.getElementById('modal-discipline-students').classList.add('open');
  }

  handleDisciplineStudentStatusChange(selectEl) {
    const studentId = selectEl.getAttribute('data-student-id');
    const row = document.getElementById(`disc-student-row-${studentId}`);
    if (!row) return;

    const val = selectEl.value;
    if (val === 'matriculado') {
      row.style.background = 'transparent';
      row.style.borderLeft = '3px solid var(--success)';
    } else if (val === 'dispensado') {
      row.style.background = 'rgba(245, 158, 11, 0.05)';
      row.style.borderLeft = '3px solid var(--warning)';
    } else {
      row.style.background = 'var(--bg-card-secondary, rgba(0,0,0,0.03))';
      row.style.borderLeft = '3px solid var(--border-color)';
    }
  }

  setAllDisciplineStudentStatus(targetStatus) {
    const selects = document.querySelectorAll('#disc-students-checkboxes-container .disc-student-status-select');
    selects.forEach(sel => {
      sel.value = targetStatus;
      this.handleDisciplineStudentStatusChange(sel);
    });
  }

  saveDisciplineStudents(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao', 'secretaria'], 'salvar matrículas da disciplina')) return;

    const turmaId = document.getElementById('disc-students-turma-id').value;
    const tdId = document.getElementById('disc-students-td-id').value;
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return;
    this.ensureTurmaDisciplines(turma);

    const td = (turma.disciplines || []).find(d => d.id === tdId);
    if (!td) return;

    const selects = document.querySelectorAll('#disc-students-checkboxes-container .disc-student-status-select');
    const studentStatuses = {};
    const enrolledIds = [];
    let matCount = 0;
    let dispCount = 0;
    let naoMatCount = 0;

    selects.forEach(sel => {
      const sId = sel.getAttribute('data-student-id');
      const val = sel.value; // 'matriculado' | 'dispensado' | 'nao_matriculado'
      studentStatuses[sId] = val;
      if (val === 'matriculado') {
        enrolledIds.push(sId);
        matCount++;
      } else if (val === 'dispensado') {
        dispCount++;
      } else {
        naoMatCount++;
      }
    });

    td.studentStatuses = studentStatuses;
    td.studentIds = enrolledIds;
    turma.atualizadoEm = new Date().toISOString();

    this.saveState();
    this.closeModal('modal-discipline-students');
    this.renderTurmaDisciplinesLists(turma);
    this.renderTurmasTable();
    this.render();

    this.showToast(`Situação dos alunos salva: ${matCount} Matriculado(s), ${dispCount} Dispensado(s), ${naoMatCount} Não Matriculado(s)!`, 'success');
  }

  /* --- Gestão de Aulas Conjuntas (Disciplinas Compartilhadas) --- */
  openSharedDisciplineModal(turmaId, tdId) {
    if (!this.checkPermission(['gestao', 'secretaria'], 'configurar aula conjunta')) return;

    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não encontrada.', 'error');
      return;
    }
    this.ensureTurmaDisciplines(turma);

    const td = (turma.disciplines || []).find(d => d.id === tdId);
    if (!td) {
      this.showToast('Disciplina não encontrada nesta turma.', 'error');
      return;
    }

    const activeSchool = this.getActiveSchool();
    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
    const prof = this.state.users.find(u => u.id === td.teacherId);
    const course = this.state.courses.find(c => c.id === turma.courseId);

    const inputTurmaId = document.getElementById('shared-disc-turma-id');
    const inputTdId = document.getElementById('shared-disc-td-id');
    if (inputTurmaId) inputTurmaId.value = turma.id;
    if (inputTdId) inputTdId.value = td.id;

    const infoBox = document.getElementById('shared-disc-info-box');
    if (infoBox) {
      infoBox.innerHTML = `
        <div style="font-weight:700; font-size:1rem; color:var(--text-main); display:flex; align-items:center; gap:8px;">
          <i class="fa-solid fa-people-arrows" style="color:var(--primary);"></i> Aula Conjunta: ${disc ? this.escapeHTML(disc.name) : 'Disciplina'}
          <span class="badge badge-primary" style="font-size:0.75rem;">Período: ${this.escapeHTML(td.periodo || 'Atual')}</span>
        </div>
        <div style="margin-top:6px; color:var(--text-muted); font-size:0.85rem; display:flex; flex-wrap:wrap; gap:12px;">
          <span><strong>Turma:</strong> ${this.escapeHTML(turma.nome)} (${course ? this.escapeHTML(course.name) : 'Geral'})</span>
          <span><strong>Professor Responsável:</strong> ${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</span>
        </div>
      `;
    }

    const container = document.getElementById('shared-disc-turmas-container');
    if (container) {
      const otherTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id && t.id !== turma.id);

      if (otherTurmas.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:1.5rem; color:var(--text-muted);">
            <i class="fa-solid fa-users-slash" style="font-size:1.8rem; opacity:0.5; margin-bottom:6px;"></i>
            <p style="margin:0; font-size:0.88rem;">Não há outras turmas cadastradas nesta escola para compartilhar aulas.</p>
          </div>
        `;
      } else {
        const currentlyShared = Array.isArray(td.sharedWithTurmaIds) ? td.sharedWithTurmaIds : [];

        container.innerHTML = otherTurmas.map(oTurma => {
          this.ensureTurmaDisciplines(oTurma);
          const oCourse = this.state.courses.find(c => c.id === oTurma.courseId);
          const isChecked = currentlyShared.includes(oTurma.id);
          const studentCount = oTurma.studentIds ? oTurma.studentIds.length : 0;
          const hasSameDisc = (oTurma.disciplines || []).some(d => d.disciplineId === td.disciplineId && d.status !== 'arquivada');

          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem; border-bottom:1px solid var(--border-color); background:${isChecked ? 'rgba(99,102,241,0.06)' : 'transparent'}; border-radius:6px; margin-bottom:4px;">
              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; flex:1; margin:0;">
                <input type="checkbox" name="shared_turma_check" value="${oTurma.id}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; margin-top:3px;">
                <div>
                  <div style="font-weight:700; font-size:0.92rem; color:var(--text-main); display:flex; align-items:center; gap:6px;">
                    ${this.escapeHTML(oTurma.nome)}
                    <span class="badge badge-secondary" style="font-size:0.7rem;">${this.escapeHTML(oTurma.turno || 'Integral')}</span>
                    ${hasSameDisc ? '<span class="badge badge-info" style="font-size:0.7rem;"><i class="fa-solid fa-book"></i> Mesma disciplina ativa</span>' : ''}
                  </div>
                  <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                    <span><i class="fa-solid fa-graduation-cap"></i> ${oCourse ? this.escapeHTML(oCourse.name) : 'Curso Geral'}</span> • 
                    <span><i class="fa-solid fa-users"></i> ${studentCount} Alunos</span>
                  </div>
                </div>
              </label>
            </div>
          `;
        }).join('');
      }
    }

    document.getElementById('modal-shared-discipline').classList.add('open');
  }

  saveSharedDiscipline(e) {
    e.preventDefault();
    if (!this.checkPermission(['gestao', 'secretaria'], 'salvar configuração de aula conjunta')) return;

    const turmaId = document.getElementById('shared-disc-turma-id').value;
    const tdId = document.getElementById('shared-disc-td-id').value;
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (!turma) return;
    this.ensureTurmaDisciplines(turma);

    const td = (turma.disciplines || []).find(d => d.id === tdId);
    if (!td) return;

    const activeSchool = this.getActiveSchool();
    const checkboxes = document.querySelectorAll('#shared-disc-turmas-container input[name="shared_turma_check"]');
    const selectedTurmaIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    td.sharedWithTurmaIds = selectedTurmaIds;
    turma.atualizadoEm = new Date().toISOString();

    // Sincronizar com as outras turmas
    const otherTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id && t.id !== turma.id);
    otherTurmas.forEach(oTurma => {
      this.ensureTurmaDisciplines(oTurma);
      const matchTd = (oTurma.disciplines || []).find(d => d.disciplineId === td.disciplineId && d.status !== 'arquivada');
      if (selectedTurmaIds.includes(oTurma.id)) {
        if (matchTd) {
          if (!Array.isArray(matchTd.sharedWithTurmaIds)) matchTd.sharedWithTurmaIds = [];
          if (!matchTd.sharedWithTurmaIds.includes(turma.id)) {
            matchTd.sharedWithTurmaIds.push(turma.id);
          }
        } else {
          // Auto-vincular a disciplina na outra turma como ativa e compartilhada
          oTurma.disciplines.push({
            id: 'td_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            disciplineId: td.disciplineId,
            teacherId: td.teacherId || null,
            periodo: td.periodo || 'Atual',
            status: 'ativa',
            sharedWithTurmaIds: [turma.id],
            studentStatuses: {},
            criadoEm: new Date().toISOString()
          });
        }
        oTurma.atualizadoEm = new Date().toISOString();
      } else {
        if (matchTd && Array.isArray(matchTd.sharedWithTurmaIds)) {
          matchTd.sharedWithTurmaIds = matchTd.sharedWithTurmaIds.filter(id => id !== turma.id);
          oTurma.atualizadoEm = new Date().toISOString();
        }
      }
    });

    this.syncAllSharedDisciplines();
    this.saveState();
    this.closeModal('modal-shared-discipline');
    this.renderTurmaDisciplinesLists(turma);
    this.renderTurmasTable();
    this.populateSelectDropdowns();
    this.render();

    const count = selectedTurmaIds.length;
    this.showToast(count > 0 
      ? `Aula conjunta configurada com sucesso com ${count} outra(s) turma(s)!` 
      : 'Configuração atualizada: esta disciplina agora é exclusiva desta turma.', 'success');
  }

  /* --- Detalhes da Disciplina da Turma (Alunos, Notas, Frequência, Horário) --- */
  openTurmaDisciplineDetails(turmaId, tdId) {
    const activeSchool = this.getActiveSchool();
    const allSchoolTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id);
    const turma = allSchoolTurmas.find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Turma não encontrada.', 'error');
      return;
    }
    this.ensureTurmaDisciplines(turma);

    // Localizar a disciplina: nativa ou compartilhada recebida
    let td = (turma.disciplines || []).find(d => d.id === tdId);
    let originTurma = turma;
    let isSharedIncoming = false;

    if (!td) {
      // Buscar se veio de outra turma via aula conjunta
      for (const otherT of allSchoolTurmas) {
        if (otherT.id !== turma.id) {
          this.ensureTurmaDisciplines(otherT);
          const match = (otherT.disciplines || []).find(d => d.id === tdId && Array.isArray(d.sharedWithTurmaIds) && d.sharedWithTurmaIds.includes(turma.id));
          if (match) {
            td = match;
            originTurma = otherT;
            isSharedIncoming = true;
            break;
          }
        }
      }
    }

    if (!td) {
      this.showToast('Disciplina não encontrada nesta turma.', 'error');
      return;
    }

    const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
    const course = this.state.courses.find(c => c.id === turma.courseId);
    const prof = this.state.users.find(u => u.id === td.teacherId) || this.state.users.find(u => u.id === originTurma.teacherId);

    this.currentDisciplineDetail = {
      turmaId,
      tdId,
      turma,
      td,
      disc,
      course,
      prof,
      originTurma,
      isSharedIncoming
    };

    // Atualizar Cabeçalho do Modal
    const titleEl = document.getElementById('disc-details-title');
    const subtitleEl = document.getElementById('disc-details-subtitle');
    const bannerEl = document.getElementById('disc-details-header-banner');

    if (titleEl) {
      titleEl.innerHTML = `<i class="fa-solid fa-book-open" style="color: var(--primary);"></i> ${disc ? this.escapeHTML(disc.name) : 'Disciplina'}`;
    }
    if (subtitleEl) {
      subtitleEl.innerHTML = `Turma: <strong>${this.escapeHTML(turma.nome)}</strong> • Curso: <strong>${course ? this.escapeHTML(course.name) : 'Geral'}</strong>`;
    }

    if (bannerEl) {
      bannerEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-size: 1.15rem; font-weight: 800; font-family: var(--font-heading); color: var(--text-main); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>${disc ? this.escapeHTML(disc.name) : 'Disciplina'}</span>
              ${disc && disc.codigo ? `<span class="badge badge-secondary" style="font-size: 0.75rem;">${this.escapeHTML(disc.codigo)}</span>` : ''}
              ${td.periodo ? `<span class="badge badge-primary" style="font-size: 0.75rem;">${this.escapeHTML(td.periodo)}</span>` : ''}
              ${isSharedIncoming ? `<span class="badge" style="background:rgba(99,102,241,0.15); color:#6366f1; border:1px solid rgba(99,102,241,0.3); font-size:0.75rem;"><i class="fa-solid fa-people-arrows"></i> Conjunta com ${this.escapeHTML(originTurma.nome)}</span>` : ''}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span><i class="fa-solid fa-graduation-cap" style="color: var(--primary);"></i> ${course ? this.escapeHTML(course.name) : 'Curso Geral'}</span>
              <span><i class="fa-solid fa-chalkboard-user" style="color: var(--primary);"></i> Prof. <strong>${prof ? this.escapeHTML(prof.nome) : 'Não atribuído'}</strong></span>
              ${turma.turno ? `<span><i class="fa-solid fa-clock" style="color: var(--primary);"></i> Turno: <strong>${this.escapeHTML(turma.turno)}</strong></span>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="btn btn-sm btn-primary" onclick="app.goToDisciplineNotas('${turma.id}', '${td.id}')" title="Lançar notas desta disciplina">
              <i class="fa-solid fa-award"></i> Lançar Notas
            </button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="app.goToDisciplineAulas('${turma.id}', '${td.id}')" title="Abrir diário e chamada">
              <i class="fa-solid fa-clipboard-user"></i> Diário & Chamada
            </button>
          </div>
        </div>
      `;
    }

    // Configurar rodapé
    const footerActions = document.getElementById('disc-details-footer-actions');
    if (footerActions) {
      footerActions.innerHTML = `
        <button type="button" class="btn btn-sm btn-secondary" onclick="app.goToDisciplineNotas('${turma.id}', '${td.id}')">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Aba Notas
        </button>
        <button type="button" class="btn btn-sm btn-secondary" onclick="app.goToDisciplineAulas('${turma.id}', '${td.id}')">
          <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Aba Diário
        </button>
      `;
    }

    // Renderizar Abas
    this.renderDisciplineStudentsTab();
    this.renderDisciplineNotasTab();
    this.renderDisciplineFrequenciaTab();
    this.renderDisciplineHorarioTab();

    // Reset para aba 'alunos'
    this.switchDisciplineDetailTab('alunos');

    const searchInput = document.getElementById('disc-details-student-search');
    if (searchInput) searchInput.value = '';

    const modal = document.getElementById('modal-turma-discipline-details');
    if (modal) modal.classList.add('open');
  }

  switchDisciplineDetailTab(tabName) {
    document.querySelectorAll('.disc-details-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-subtab') === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    const panes = {
      alunos: document.getElementById('disc-pane-alunos'),
      notas: document.getElementById('disc-pane-notas'),
      frequencia: document.getElementById('disc-pane-frequencia'),
      horario: document.getElementById('disc-pane-horario')
    };

    Object.keys(panes).forEach(key => {
      if (panes[key]) {
        if (key === tabName) {
          panes[key].style.display = 'block';
          panes[key].classList.add('active');
        } else {
          panes[key].style.display = 'none';
          panes[key].classList.remove('active');
        }
      }
    });
  }

  renderDisciplineStudentsTab() {
    if (!this.currentDisciplineDetail) return;
    const { turma, td } = this.currentDisciplineDetail;
    const students = this.getEnrolledStudentsForTurmaDiscipline ? this.getEnrolledStudentsForTurmaDiscipline(turma.id, td.id) : [];
    this.currentDisciplineStudents = students;

    const countBadge = document.getElementById('disc-details-count-alunos');
    if (countBadge) countBadge.textContent = students.length;

    const summaryEl = document.getElementById('disc-details-student-summary');
    if (summaryEl) summaryEl.textContent = `Total enturmado: ${students.length} aluno(s)`;

    this.filterDisciplineStudents('');
  }

  filterDisciplineStudents(query) {
    const container = document.getElementById('disc-details-students-container');
    if (!container) return;

    const q = (query || '').toLowerCase().trim();
    const students = this.currentDisciplineStudents || [];

    const filtered = students.filter(st => {
      if (!q) return true;
      const nome = (st.nome || '').toLowerCase();
      const ra = (st.ra || '').toLowerCase();
      const email = (st.email || '').toLowerCase();
      return nome.includes(q) || ra.includes(q) || email.includes(q);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-card);">
          <i class="fa-solid fa-user-graduate" style="font-size: 2rem; opacity: 0.4; margin-bottom: 0.5rem;"></i>
          <p style="margin: 0; font-size: 0.9rem;">
            ${q ? 'Nenhum aluno encontrado para a busca informada.' : 'Nenhum aluno matriculado nesta disciplina até o momento.'}
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(st => {
      const initials = (st.nome || 'Aluno').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const isJoint = st.originTurmaId && st.originTurmaId !== this.currentDisciplineDetail.turma.id;

      return `
        <div class="disc-student-row">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <div class="user-avatar" style="width: 38px; height: 38px; font-size: 0.9rem; flex-shrink: 0; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: #fff;">
              ${initials}
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span>${this.escapeHTML(st.nome)}</span>
                ${isJoint ? `<span class="badge" style="background:rgba(99,102,241,0.15); color:#6366f1; border:1px solid rgba(99,102,241,0.3); font-size:0.68rem; padding:1px 6px;">Turma ${this.escapeHTML(st.originTurmaNome || 'Origem')}</span>` : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 1px;">
                ${st.email ? `<i class="fa-solid fa-envelope" style="font-size: 0.75rem;"></i> ${this.escapeHTML(st.email)}` : 'Sem email cadastrado'}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
            <span class="ra-badge" style="font-size: 0.78rem; padding: 3px 8px;">${this.escapeHTML(st.ra || 'S/ RA')}</span>
            <span class="badge badge-success" style="font-size: 0.72rem; padding: 3px 8px;">Matriculado</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderDisciplineNotasTab() {
    const container = document.getElementById('disc-details-notas-container');
    if (!container || !this.currentDisciplineDetail) return;

    const { turma, td, disc } = this.currentDisciplineDetail;
    const students = this.currentDisciplineStudents || [];

    // Localizar avaliações associadas
    const evals = (this.state.evaluations || []).filter(e => {
      const [eTId, eTdId] = (e.turmaId || e.rawTurmaId || '').split('__');
      if (eTId === turma.id) {
        if (eTdId && eTdId === td.id) return true;
        if (e.turmaDisciplinaId === td.id) return true;
        if (e.disciplineId === td.disciplineId) return true;
      }
      return false;
    });

    if (evals.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
          <i class="fa-solid fa-award" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 0.75rem; color: var(--primary);"></i>
          <h4 style="font-size: 1.05rem; color: var(--text-main); font-weight: 700; margin-bottom: 0.4rem;">
            Nenhum instrumento de avaliação cadastrado
          </h4>
          <p style="font-size: 0.88rem; max-width: 480px; margin: 0 auto 1.25rem;">
            Crie provas, trabalhos ou seminários e lance as notas dos alunos diretamente no módulo de Notas & Avaliações.
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="app.goToDisciplineNotas('${turma.id}', '${td.id}')">
            <i class="fa-solid fa-plus"></i> Configurar Avaliações e Lançar Notas
          </button>
        </div>
      `;
      return;
    }

    const calcType = this.getGradeCalcType ? this.getGradeCalcType(turma.id, td.id) : 'aritmetica';
    const calcLabel = calcType === 'ponderada' ? 'Média Ponderada' : (calcType === 'somatoria' ? 'Somatória' : 'Média Aritmética');

    let tableHeaders = evals.map(ev => `
      <th style="text-align: center; font-size: 0.8rem; white-space: nowrap;">
        ${this.escapeHTML(ev.title)}
        ${ev.weight && ev.weight !== 1 ? `<span style="display:block; font-size:0.7rem; font-weight:normal; opacity:0.8;">(Peso ${ev.weight})</span>` : ''}
      </th>
    `).join('');

    let tableRows = students.map(st => {
      let gradeSum = 0;
      let totalWeight = 0;
      let hasAnyGrade = false;

      const evalCells = evals.map(ev => {
        const gradeKey = `${ev.id}_${st.id}`;
        const val = this.state.studentGrades ? this.state.studentGrades[gradeKey] : undefined;
        if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val);
          hasAnyGrade = true;
          const w = ev.weight || 1;
          gradeSum += num * w;
          totalWeight += w;
          return `<td style="text-align: center; font-weight: 700; color: ${num >= 7 ? 'var(--success)' : (num >= 5 ? 'var(--warning)' : 'var(--danger)')}; font-size: 0.88rem;">${num.toFixed(1)}</td>`;
        }
        return `<td style="text-align: center; color: var(--text-muted); font-size: 0.85rem;">-</td>`;
      }).join('');

      let finalMedia = '-';
      if (hasAnyGrade) {
        if (calcType === 'somatoria') {
          finalMedia = gradeSum.toFixed(1);
        } else {
          finalMedia = (totalWeight > 0 ? (gradeSum / totalWeight) : 0).toFixed(1);
        }
      }

      const mediaNum = parseFloat(finalMedia);
      const isApproved = !isNaN(mediaNum) && mediaNum >= 7;

      return `
        <tr>
          <td style="padding: 0.65rem 0.85rem;">
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${this.escapeHTML(st.nome)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHTML(st.ra || '')}</div>
          </td>
          ${evalCells}
          <td style="text-align: center; font-weight: 800; font-size: 0.95rem; color: ${!isNaN(mediaNum) ? (isApproved ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)'};">
            ${finalMedia}
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 0.5rem;">
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Cálculo: <strong style="color: var(--text-main);">${calcLabel}</strong> • Total de <strong>${evals.length}</strong> avaliação(ões)
        </div>
        <button type="button" class="btn btn-sm btn-primary" onclick="app.goToDisciplineNotas('${turma.id}', '${td.id}')">
          <i class="fa-solid fa-pen-to-square"></i> Lançar / Alterar Notas
        </button>
      </div>

      <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="data-table" style="width: 100%; margin: 0;">
          <thead>
            <tr>
              <th style="text-align: left; font-size: 0.8rem;">Aluno</th>
              ${tableHeaders}
              <th style="text-align: center; font-size: 0.8rem; background: var(--bg-card-secondary, rgba(0,0,0,0.03));">Média</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  renderDisciplineFrequenciaTab() {
    const container = document.getElementById('disc-details-frequencia-container');
    if (!container || !this.currentDisciplineDetail) return;

    const { turma, td } = this.currentDisciplineDetail;
    const students = this.currentDisciplineStudents || [];

    // Aulas desta turma e disciplina
    const lessons = (this.state.lessons || []).filter(les => {
      const [lTId, lTdId] = (les.turmaId || '').split('__');
      if (lTId === turma.id) {
        if (lTdId && lTdId === td.id) return true;
        if (les.turmaDisciplinaId === td.id) return true;
        if (les.disciplineId === td.disciplineId) return true;
      }
      return false;
    }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    if (lessons.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
          <i class="fa-solid fa-clipboard-user" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 0.75rem; color: var(--primary);"></i>
          <h4 style="font-size: 1.05rem; color: var(--text-main); font-weight: 700; margin-bottom: 0.4rem;">
            Nenhuma aula registrada nesta disciplina
          </h4>
          <p style="font-size: 0.88rem; max-width: 480px; margin: 0 auto 1.25rem;">
            Cadastre aulas ministradas no Diário de Classe para registrar tópicos, materiais e realizar a chamada de presença.
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="app.goToDisciplineAulas('${turma.id}', '${td.id}')">
            <i class="fa-solid fa-plus"></i> Registrar Primeira Aula
          </button>
        </div>
      `;
      return;
    }

    // Calcular estatísticas
    let totalPresences = 0;
    let totalPossible = 0;
    lessons.forEach(les => {
      const att = this.state.attendance ? this.state.attendance[les.id] : null;
      if (att && typeof att === 'object') {
        const studentCount = Object.keys(att).length || students.length;
        const presentCount = Object.values(att).filter(v => v === 'Presente' || v === 'Justificado').length;
        totalPresences += presentCount;
        totalPossible += studentCount;
      }
    });

    const overallRate = totalPossible > 0 ? Math.round((totalPresences / totalPossible) * 100) : 100;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <span class="badge badge-primary" style="font-size: 0.82rem; padding: 4px 10px;">
            <i class="fa-solid fa-book-bookmark"></i> ${lessons.length} Aula(s) Ministrada(s)
          </span>
          <span class="badge badge-success" style="font-size: 0.82rem; padding: 4px 10px;">
            <i class="fa-solid fa-check"></i> ${overallRate}% de Presença Média
          </span>
        </div>
        <button type="button" class="btn btn-sm btn-primary" onclick="app.goToDisciplineAulas('${turma.id}', '${td.id}')">
          <i class="fa-solid fa-plus"></i> Nova Aula no Diário
        </button>
      </div>

      <div style="max-height: 360px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
        <table class="data-table" style="width: 100%; margin: 0;">
          <thead>
            <tr>
              <th style="width: 110px;">Data</th>
              <th>Conteúdo / Plano de Aula</th>
              <th style="width: 130px; text-align: center;">Presenças</th>
              <th style="width: 110px; text-align: right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lessons.map(les => {
              const att = this.state.attendance ? this.state.attendance[les.id] : null;
              const hasAtt = att && Object.keys(att).length > 0;
              const presentCount = hasAtt ? Object.values(att).filter(v => v === 'Presente' || v === 'Justificado').length : 0;
              const totalInClass = hasAtt ? Object.keys(att).length : students.length;
              const rate = totalInClass > 0 ? Math.round((presentCount / totalInClass) * 100) : 0;

              return `
                <tr>
                  <td style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                    ${les.data ? this.formatDate(les.data) : 'Data N/D'}
                  </td>
                  <td>
                    <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${this.escapeHTML(les.titulo || les.conteudo || 'Aula Ministrada')}</div>
                    ${les.resumo ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${this.escapeHTML(les.resumo)}</div>` : ''}
                  </td>
                  <td style="text-align: center;">
                    ${hasAtt ? `
                      <span class="badge ${rate >= 75 ? 'badge-success' : 'badge-warning'}" style="font-size: 0.75rem;">
                        ${presentCount} / ${totalInClass} (${rate}%)
                      </span>
                    ` : `
                      <span class="badge" style="background: var(--bg-card-secondary, rgba(0,0,0,0.06)); color: var(--text-muted); font-size: 0.72rem;">Pendente</span>
                    `}
                  </td>
                  <td style="text-align: right;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="app.goToDisciplineAulas('${turma.id}', '${td.id}')" title="Ver detalhes da aula no Diário" style="padding: 2px 8px; font-size: 0.75rem;">
                      <i class="fa-solid fa-eye"></i> Diário
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderDisciplineHorarioTab() {
    const container = document.getElementById('disc-details-horario-container');
    if (!container || !this.currentDisciplineDetail) return;

    const { turma, td, disc } = this.currentDisciplineDetail;
    const activeSchool = this.getActiveSchool();
    const allSchedules = (this.state.schedules || []).filter(s => s.schoolId === activeSchool.id);

    // Localizar horários específicos desta turma e disciplina (ou da turma)
    const schedules = allSchedules.filter(s => {
      const [sTId, sTdId] = (s.turmaId || '').split('__');
      if (sTId === turma.id) {
        if (!sTdId) return true; // Horário geral da turma
        if (sTdId === td.id) return true; // Específico da disciplina
      }
      return false;
    });

    const daysOrder = { 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6, 'Domingo': 7 };
    schedules.sort((a, b) => {
      const diff = (daysOrder[a.dayOfWeek] || 99) - (daysOrder[b.dayOfWeek] || 99);
      if (diff !== 0) return diff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    if (schedules.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
          <i class="fa-solid fa-clock" style="font-size: 2.5rem; opacity: 0.4; margin-bottom: 0.75rem; color: var(--primary);"></i>
          <h4 style="font-size: 1.05rem; color: var(--text-main); font-weight: 700; margin-bottom: 0.4rem;">
            Nenhum horário cadastrado para esta disciplina
          </h4>
          <p style="font-size: 0.88rem; max-width: 480px; margin: 0 auto 1.25rem;">
            Você pode consultar a grade semanal completa no menu Quadro de Horários.
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="app.switchTab('tab-horarios'); app.closeModal('modal-turma-discipline-details');">
            <i class="fa-solid fa-calendar-days"></i> Abrir Quadro de Horários
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <span style="font-size: 0.88rem; color: var(--text-muted);">
          Total de <strong>${schedules.length}</strong> sessão(ões) semanal(is) cadastrada(s):
        </span>
        <button type="button" class="btn btn-sm btn-secondary" onclick="app.switchTab('tab-horarios'); app.closeModal('modal-turma-discipline-details');">
          <i class="fa-solid fa-calendar-days"></i> Ver Quadro Semanal Completo
        </button>
      </div>

      <div class="grid-2" style="gap: 1rem;">
        ${schedules.map(sch => `
          <div class="disc-schedule-card">
            <div style="width: 46px; height: 46px; border-radius: 12px; background: rgba(37, 99, 235, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
              <i class="fa-solid fa-clock"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main);">
                ${this.escapeHTML(sch.dayOfWeek || 'Dia da Semana')}
              </div>
              <div style="font-size: 0.88rem; font-weight: 700; color: var(--primary); margin-top: 2px;">
                <i class="fa-regular fa-clock"></i> ${this.escapeHTML(sch.startTime || '19:00')} às ${this.escapeHTML(sch.endTime || '20:40')}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                <span><i class="fa-solid fa-door-open"></i> Sala: <strong>${this.escapeHTML(sch.room || 'Sala padrão')}</strong></span>
                ${turma.turno ? `<span>• Turno: <strong>${this.escapeHTML(turma.turno)}</strong></span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  goToDisciplineNotas(turmaId, tdId) {
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (turma) {
      this.selectedGradeCourseId = turma.courseId;
    }
    this.selectedGradeTurmaId = `${turmaId}__${tdId}`;
    this.closeModal('modal-turma-discipline-details');
    this.switchTab('tab-notas');
    this.showToast('Navegando para o lançamento de notas desta disciplina...', 'info');
  }

  goToDisciplineAulas(turmaId, tdId) {
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (turma) {
      this.selectedLessonCourseId = turma.courseId;
    }
    this.selectedLessonTurmaId = `${turmaId}__${tdId}`;
    this.closeModal('modal-turma-discipline-details');
    this.switchTab('tab-aulas');
    this.showToast('Navegando para o Diário de Aulas desta disciplina...', 'info');
  }

  goToTurmaAulas(turmaId) {
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (turma) {
      this.selectedLessonCourseId = turma.courseId;
    }
    this.selectedLessonTurmaId = turmaId;
    this.switchTab('tab-aulas');
  }

  goToTurmaHorarios(turmaId) {
    const turma = this.state.classes.find(t => t.id === turmaId);
    if (turma) {
      this.selectedScheduleCourseId = turma.courseId;
    }
    this.selectedScheduleTurmaId = turmaId;
    this.switchTab('tab-horarios');
  }

  /* --- Financeiro --- */
  renderFinanceiroTable() { return this.financialModule.renderFinanceiroTable(); }
  handleFinancialCourseChange() { return this.financialModule.handleFinancialCourseChange(); }
  handleFinancialTurmaChange() { return this.financialModule.handleFinancialTurmaChange(); }
  handleFinancialMonthChange() { return this.financialModule.handleFinancialMonthChange(); }
  handleFinancialSearch(e) { return this.financialModule.handleFinancialSearch(e); }
  openDiscountModal(turmaId, studentId, monthKey) { return this.financialModule.openDiscountModal(turmaId, studentId, monthKey); }
  openBolsaModal(turmaId, studentId, monthKey) { return this.financialModule.openBolsaModal(turmaId, studentId, monthKey); }
  openDescontoPontualModal(turmaId, studentId, monthKey) { return this.financialModule.openDescontoPontualModal(turmaId, studentId, monthKey); }
  updateDiscountPreview() { return this.financialModule.updateDiscountPreview(); }
  handleSaveDiscount(e) { return this.financialModule.handleSaveDiscount(e); }
  removeDiscount() { return this.financialModule.removeDiscount(); }
  toggleFinancialPayment(turmaId, studentId, monthKey) { return this.financialModule.togglePaymentStatus(turmaId, studentId, monthKey); }
  openFinancialModal() { return this.financialModule.openFinancialModal(); }
  openStudentCarneModal(turmaId, studentId) { return this.financialModule.openStudentCarneModal(turmaId, studentId); }
  editFinancial(id) { return this.financialModule.editFinancial(id); }
  handleSaveFinancial(e) { return this.financialModule.handleSaveFinancial(e); }
  deleteFinancial(id) { return this.financialModule.deleteFinancial(id); }
  payFinancial(id) { return this.financialModule.payFinancial(id); }
  openFinancialReportModal() { return this.financialModule.openFinancialReportModal(); }
  handleReportCourseChange(autoGenerate) { return this.financialModule.handleReportCourseChange(autoGenerate); }
  generateFinancialReport() { return this.financialModule.generateFinancialReport(); }
  printFinancialReport() { return this.financialModule.printFinancialReport(); }
  sendWhatsAppCobrança(studentId, turmaId, monthKey) { return this.financialModule.sendWhatsAppCobrança(studentId, turmaId, monthKey); }
  exportFinancialReportCSV() { return this.financialModule.exportFinancialReportCSV(); }
  openPixModal(turmaId, studentId, monthKey) { return this.financialModule.openPixModal(turmaId, studentId, monthKey); }
  copyPixCode(e) { return this.financialModule.copyPixCode(e); }
  copyRawPixKey(e) { return this.financialModule.copyRawPixKey(e); }

  /* --- Máscaras de Usuário --- */
  maskCPF(el) { return this.usersModule.maskCPF(el); }
  maskPhone(el) { return this.usersModule.maskPhone(el); }
  maskDateBR(el) { return this.usersModule.maskDateBR(el); }

  /* --- Importação em Lote de Alunos (CSV/Planilha) --- */
  openImportStudentsModal() { return this.usersModule.openImportStudentsModal(); }
  downloadCsvTemplate() { return this.usersModule.downloadCsvTemplate(); }
  handleImportCsvFile(e) { return this.usersModule.handleImportCsvFile(e); }
  previewImportedStudents() { return this.usersModule.previewImportedStudents(); }
  executeImportStudents() { return this.usersModule.executeImportStudents(); }

  /* --- Relatórios Acadêmicos (Boletim & Diário) --- */
  generateBoletim(studentId, turmaId) { return this.academicReportsModule.generateBoletim(studentId, turmaId); }
  generateBoletimForSelectedStudent() {
    const activeSchool = this.getActiveSchool();
    if (!activeSchool) return;

    if (this.currentRole === 'aluno' && this.currentUser) {
      return this.academicReportsModule.generateBoletim(this.currentUser.id);
    }

    const turmaSelect = document.getElementById('notas-filter-turma');
    const turmaId = turmaSelect ? turmaSelect.value : null;
    const turma = (this.state.classes || []).find(t => t.id === turmaId);

    if (!turma || !turma.studentIds || turma.studentIds.length === 0) {
      const aluno = (this.state.users || []).find(u => u.tipo === 'aluno' && u.schoolId === activeSchool.id);
      if (aluno) {
        return this.academicReportsModule.generateBoletim(aluno.id);
      }
      this.showToast('Nenhum aluno cadastrado nesta turma para emitir o boletim.', 'warning');
      return;
    }

    return this.academicReportsModule.generateBoletim(turma.studentIds[0], turma.id);
  }

  generateDiarioClasse(turmaId, disciplineId) { return this.academicReportsModule.generateDiarioClasse(turmaId, disciplineId); }
  generateDiarioClasseCurrent() {
    const turmaSelect = document.getElementById('lesson-filter-turma');
    const turmaId = turmaSelect ? turmaSelect.value : null;
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) {
      this.showToast('Selecione uma turma para emitir o Diário de Classe Oficial.', 'warning');
      return;
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const disciplineId = (turma.disciplineIds && turma.disciplineIds.length > 0) 
      ? turma.disciplineIds[0] 
      : (course && course.disciplineIds && course.disciplineIds.length > 0 ? course.disciplineIds[0] : null);

    if (!disciplineId) {
      this.showToast('A turma selecionada não possui nenhuma disciplina vinculada.', 'warning');
      return;
    }

    return this.academicReportsModule.generateDiarioClasse(turma.id, disciplineId);
  }

  /* --- Backup & Restauração de Dados --- */
  exportSystemBackup() {
    try {
      const dataStr = JSON.stringify(this.state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().substring(0, 10);
      link.setAttribute('href', url);
      link.setAttribute('download', `backup_portal_curso_${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.showToast('Backup completo do sistema gerado e baixado com sucesso!', 'success');
    } catch (e) {
      this.showToast('Erro ao gerar arquivo de backup: ' + e.message, 'error');
    }
  }

  async restoreSystemBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const confirmed = await this.confirmAction({
      title: 'Restaurar Backup Completo',
      message: 'ATENÇÃO: A restauração substituirá todos os dados atuais pelo conteúdo do arquivo de backup selecionado. Deseja realmente prosseguir?',
      confirmText: 'Sim, Restaurar Dados',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) {
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsedData = JSON.parse(e.target.result);
        if (!parsedData || typeof parsedData !== 'object') {
          throw new Error('Formato JSON inválido.');
        }

        this.state = parsedData;
        this.saveState();

        this.showToast('Backup restaurado com sucesso! Recarregando sistema...', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } catch (err) {
        this.showToast('Falha ao processar o arquivo de backup: ' + err.message, 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  /* --- Aulas & Diário & Chamada por Aula --- */
  getTeacherAvailableCoursesAndClasses() {
    const activeSchool = this.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;
    const schoolTurmas = (this.state.classes || []).filter(t => t.schoolId === schoolId);

    const activeUser = this.currentUser || null;
    let relevantTurmas = [];

    if (this.currentRole === 'professor') {
      const teacherUser = (activeUser && activeUser.tipo === 'professor')
        ? activeUser
        : (this.state.users.find(u => u.tipo === 'professor' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'professor'));

      relevantTurmas = schoolTurmas.filter(t => {
        if (!teacherUser) return true;
        this.ensureTurmaDisciplines(t);
        if (t.teacherId === teacherUser.id) return true;
        if (t.disciplines && t.disciplines.some(d => (d.teacherId === teacherUser.id || d.professorId === teacherUser.id) && d.status !== 'arquivada')) return true;
        return false;
      });

      if (relevantTurmas.length === 0) {
        relevantTurmas = schoolTurmas;
      }
    } else if (this.currentRole === 'aluno') {
      const studentUser = (activeUser && activeUser.tipo === 'aluno')
        ? activeUser
        : (this.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.state.users.find(u => u.tipo === 'aluno'));

      relevantTurmas = schoolTurmas.filter(t => {
        if (!studentUser) return true;
        return (t.studentIds || []).includes(studentUser.id);
      });

      if (relevantTurmas.length === 0) {
        relevantTurmas = schoolTurmas;
      }
    } else {
      relevantTurmas = schoolTurmas;
    }

    const courseIds = new Set(relevantTurmas.map(t => t.courseId).filter(Boolean));
    let availableCourses = (this.state.courses || []).filter(c => c.schoolId === schoolId && courseIds.has(c.id));
    if (availableCourses.length === 0) {
      availableCourses = (this.state.courses || []).filter(c => c.schoolId === schoolId);
    }

    return { relevantTurmas, availableCourses };
  }

  handleLessonCourseChange() {
    const courseSelect = document.getElementById('lesson-filter-curso');
    if (courseSelect) {
      this.selectedLessonCourseId = courseSelect.value;
      this.selectedLessonTurmaId = null;
      this.renderLessonsList();
    }
  }

  handleLessonTurmaChange() {
    const turmaSelect = document.getElementById('lesson-filter-turma');
    if (turmaSelect) {
      this.selectedLessonTurmaId = turmaSelect.value;
      this.renderLessonsList();
    }

  }

  renderLessonsList() { return this.lessonModule.renderLessonsList(); }
  openLessonModal() { return this.lessonModule.openLessonModal(); }
  openEditLessonModal(lessonId) { return this.lessonModule.openEditLessonModal(lessonId); }
  handleSaveLesson(e) { return this.lessonModule.handleSaveLesson(e); }
  deleteLesson(lessonId) { return this.lessonModule.deleteLesson(lessonId); }
  openAttendanceForLesson(lessonId) { return this.lessonModule.openAttendanceForLesson(lessonId); }
  renderLessonAttendanceTable(turma, tdId = null) { return this.lessonModule.renderLessonAttendanceTable(turma, tdId); }
  markAllPresentInLesson() { return this.lessonModule.markAllPresentInLesson(); }
  markAllAbsentInLesson() { return this.lessonModule.markAllAbsentInLesson(); }
  saveLessonAttendance() { return this.lessonModule.saveLessonAttendance(); }
  openQuickAttendanceModal() {
    if (this.selectedLessonTurmaId) {
      const [tId, tdId] = this.selectedLessonTurmaId.split('__');
      const turma = (this.state.classes || []).find(t => t.id === tId);
      if (turma) {
        this.renderLessonAttendanceTable(turma, tdId);
        document.getElementById('modal-attendance-lesson')?.classList.add('open');
        return;
      }
    }
    this.openLessonModal();
  }
  openTurmaAttendanceSummaryModal(lessonId = null) { return this.lessonModule.openTurmaAttendanceSummaryModal(lessonId || this.activeLessonId); }

  /* --- Resumo da Frequência Acumulada da Turma --- */
  renderAttendanceTable() {
    const tbody = document.getElementById('table-frequencia-body');
    if (!tbody) return;

    const select = document.getElementById('freq-turma-select');
    const selectedRawId = select ? select.value : (this.state.classes[0] ? this.state.classes[0].id : null);
    if (!selectedRawId) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Nenhuma turma formada.</td></tr>`;
      return;
    }

    const [selectedTurmaId, selectedTdId] = selectedRawId.split('__');
    const turma = this.state.classes.find(t => t.id === selectedTurmaId);

    if (!turma) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Turma não encontrada.</td></tr>`;
      return;
    }
    this.ensureTurmaDisciplines(turma);

    const enrolledStudents = this.getEnrolledStudentsForTurmaDiscipline(selectedTurmaId, selectedTdId);

    if (enrolledStudents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Nenhum aluno matriculado nesta turma/disciplina.</td></tr>`;
      return;
    }

    // Filtrar aulas correspondentes à turma e à disciplina (incluindo aulas conjuntas)
    const relevantTurmaRawIds = new Set([selectedRawId, selectedTurmaId]);
    if (selectedTdId && turma.disciplines) {
      const td = turma.disciplines.find(d => d.id === selectedTdId);
      if (td && Array.isArray(td.sharedWithTurmaIds)) {
        td.sharedWithTurmaIds.forEach(otherTId => {
          relevantTurmaRawIds.add(otherTId);
          const otherT = this.state.classes.find(t => t.id === otherTId);
          if (otherT && otherT.disciplines) {
            const matchTd = otherT.disciplines.find(d => d.disciplineId === td.disciplineId);
            if (matchTd) relevantTurmaRawIds.add(`${otherT.id}__${matchTd.id}`);
          }
        });
      }
    }

    const turmaLessons = this.state.lessons.filter(l => {
      return relevantTurmaRawIds.has(l.turmaId) || (l.turmaId && relevantTurmaRawIds.has(l.turmaId.split('__')[0]));
    });
    const totalLessons = turmaLessons.length;

    tbody.innerHTML = enrolledStudents.map(aluno => {
      const stId = aluno.id;
      let presencas = 0;
      let faltas = 0;

      turmaLessons.forEach(les => {
        const att = this.state.attendance[les.id];
        if (att && att[stId]) {
          if (att[stId] === 'Presente' || att[stId] === 'Justificado') {
            presencas++;
          } else if (att[stId] === 'Ausente') {
            faltas++;
          }
        } else {
          presencas++; // Default se não registrado ainda
        }
      });

      const freqPct = totalLessons > 0 ? Math.round((presencas / totalLessons) * 100) : 100;
      const badgeClass = freqPct >= 75 ? 'badge-success' : 'badge-danger';
      const turmaBadge = aluno.isJoint 
        ? `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; font-size:0.72rem; margin-left:6px;"><i class="fa-solid fa-people-arrows"></i> ${this.escapeHTML(aluno.originTurmaNome)}</span>`
        : '';

      return `
        <tr>
          <td><span class="ra-badge">${aluno.ra || '-'}</span></td>
          <td>
            <strong>${this.escapeHTML(aluno.nome)}</strong>
            ${turmaBadge}
          </td>
          <td>${totalLessons} Aulas</td>
          <td><strong style="color:var(--success);">${presencas}</strong></td>
          <td><strong style="color:var(--danger);">${faltas}</strong></td>
          <td><span class="badge ${badgeClass}">${freqPct}% Frequência</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="app.switchTab('tab-aulas')">
              <i class="fa-solid fa-list-check"></i> Ver Aulas & Chamadas
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* --- Instrumentos de AvaliaÃ§Ã£o & Notas DinÃ¢micas Otimizadas --- */
  handleGradesCourseChange() { return this.gradeModule.handleGradesCourseChange(); }
  handleGradesTurmaChange() { return this.gradeModule.handleGradesTurmaChange(); }
  getEvaluationsForTurmaDiscipline(turmaId, tdId) { return this.gradeModule.getEvaluationsForTurmaDiscipline(turmaId, tdId); }
  getGradeCalcType(turmaId, tdId) { return this.gradeModule.getGradeCalcType(turmaId, tdId); }
  handleGradeCalcTypeChange(newType) { return this.gradeModule.handleGradeCalcTypeChange(newType); }
  toggleCriterioCustomInputs(type) { return this.gradeModule.toggleCriterioCustomInputs(type); }
  getGradingCriteria(turmaId, tdId) { return this.gradeModule.getGradingCriteria(turmaId, tdId); }
  getStudentGradeStatus(mediaVal, criteria) { return this.gradeModule.getStudentGradeStatus(mediaVal, criteria); }
  openTurmaGradingScaleModal(turmaId, tdId) { return this.gradeModule.openTurmaGradingScaleModal(turmaId, tdId); }
  handleSaveTurmaGradingScale(e) { return this.gradeModule.handleSaveTurmaGradingScale(e); }
  openEvaluationModal() { return this.gradeModule.openEvaluationModal(); }
  handleSaveEvaluation(e) { return this.gradeModule.handleSaveEvaluation(e); }
  deleteEvaluation(evalId) { return this.gradeModule.deleteEvaluation(evalId); }
  calculateLiveGradeRow(inputEl, studentId) { return this.gradeModule.calculateLiveGradeRow(inputEl, studentId); }
  saveStudentGrade(rawTurmaId, studentId) { return this.gradeModule.saveStudentGrade(rawTurmaId, studentId); }
  saveAllStudentGrades() { return this.gradeModule.saveAllStudentGrades(); }
  renderGradesTable() { return this.gradeModule.renderGradesTable(); }

  /* --- Bibliografia Helper Methods --- */
  getCourseDisciplines(courseId) {
    const activeSchool = this.getActiveSchool();
    const allSchoolDiscs = (this.state.disciplines || []).filter(d => !d.schoolId || (activeSchool && d.schoolId === activeSchool.id));

    if (!courseId || courseId === 'todos') {
      return allSchoolDiscs;
    }

    // 1. Verificar matriz curricular (curriculumGrid)
    const gridDiscIds = (this.state.curriculumGrid || [])
      .filter(cg => cg.courseId === courseId)
      .map(cg => cg.disciplineId);

    // 2. Verificar turmas do curso
    const turmaDiscIds = (this.state.classes || [])
      .filter(t => t.courseId === courseId)
      .flatMap(t => [t.disciplineId, ...(t.disciplineIds || [])])
      .filter(Boolean);

    const linkedIds = new Set([...gridDiscIds, ...turmaDiscIds]);
    const matched = allSchoolDiscs.filter(d => linkedIds.has(d.id));

    return matched.length > 0 ? matched : allSchoolDiscs;
  }

  getBiblioCourseId(bib) {
    if (bib && bib.courseId) return bib.courseId;
    if (!bib || !bib.disciplineId) return null;

    const cg = (this.state.curriculumGrid || []).find(g => g.disciplineId === bib.disciplineId);
    if (cg && cg.courseId) return cg.courseId;

    const cl = (this.state.classes || []).find(c => c.disciplineId === bib.disciplineId || (c.disciplineIds && c.disciplineIds.includes(bib.disciplineId)));
    if (cl && cl.courseId) return cl.courseId;

    return null;
  }

  handleBiblioCourseChange() {
    const courseSelect = document.getElementById('biblio-filter-curso');
    if (courseSelect) {
      this.selectedBiblioCourseId = courseSelect.value;
      this.selectedBiblioDisciplineId = 'todas';
      this.renderBiblioList();
    }
  }

  handleBiblioDisciplineChange() {
    const discSelect = document.getElementById('biblio-filter-disciplina');
    if (discSelect) {
      this.selectedBiblioDisciplineId = discSelect.value;
      this.renderBiblioList();
    }
  }

  handleBiblioModalCourseChange() {
    const courseSelect = document.getElementById('biblio-modal-curso');
    const discSelect = document.getElementById('biblio-disciplina');
    if (!courseSelect || !discSelect) return;

    const courseId = courseSelect.value;
    const discs = this.getCourseDisciplines(courseId);
    discSelect.innerHTML = discs.map(d => `<option value="${d.id}">${d.code ? d.code + ' - ' : ''}${d.name}</option>`).join('');
  }

  /* --- Bibliografia --- */
  renderBiblioList() {
    const container = document.getElementById('biblio-list-container');
    if (!container) return;

    if (!this.state.bibliographies) this.state.bibliographies = [];

    const activeSchool = this.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    // Obter cursos disponíveis conforme permissão e perfil
    const { availableCourses } = this.getTeacherAvailableCoursesAndClasses();
    const courses = (availableCourses && availableCourses.length > 0)
      ? availableCourses
      : (this.state.courses || []).filter(c => !c.schoolId || c.schoolId === schoolId);

    // Atualizar badge de contexto
    const badgeEl = document.getElementById('biblio-role-context-badge');
    if (badgeEl) {
      if (this.currentRole === 'professor') {
        badgeEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Cursos sob sua docência`;
      } else if (this.currentRole === 'aluno') {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Cursos em que você está matriculado`;
      } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-book-bookmark"></i> Acervo Institucional`;
      }
    }

    // 1. Preencher seletor de Cursos (Filtro)
    const courseFilter = document.getElementById('biblio-filter-curso');
    if (courseFilter) {
      let courseOptions = `<option value="todos">Todos os Cursos</option>`;
      courseOptions += courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      courseFilter.innerHTML = courseOptions;

      if (!this.selectedBiblioCourseId || (this.selectedBiblioCourseId !== 'todos' && !courses.some(c => c.id === this.selectedBiblioCourseId))) {
        this.selectedBiblioCourseId = 'todos';
      }
      courseFilter.value = this.selectedBiblioCourseId;
    }

    // 2. Preencher seletor de Disciplinas (Filtro)
    const discFilter = document.getElementById('biblio-filter-disciplina');
    const availableDisciplines = this.getCourseDisciplines(this.selectedBiblioCourseId);

    if (discFilter) {
      let discOptions = `<option value="todas">Todas as Disciplinas</option>`;
      discOptions += availableDisciplines.map(d => `<option value="${d.id}">${d.code ? d.code + ' - ' : ''}${d.name}</option>`).join('');
      discFilter.innerHTML = discOptions;

      if (!this.selectedBiblioDisciplineId || (this.selectedBiblioDisciplineId !== 'todas' && !availableDisciplines.some(d => d.id === this.selectedBiblioDisciplineId))) {
        this.selectedBiblioDisciplineId = 'todas';
      }
      discFilter.value = this.selectedBiblioDisciplineId;
    }

    // 3. Filtrar a lista de bibliografias
    const schoolDisciplines = (this.state.disciplines || []).filter(d => !d.schoolId || (activeSchool && d.schoolId === activeSchool.id));
    const schoolDisciplineIds = new Set(schoolDisciplines.map(d => d.id));

    let filteredList = this.state.bibliographies.filter(b => {
      const bCourseId = this.getBiblioCourseId(b);
      const isSchoolCourse = bCourseId ? courses.some(c => c.id === bCourseId) : true;
      const isSchoolDisc = b.disciplineId ? schoolDisciplineIds.has(b.disciplineId) : true;
      return isSchoolCourse || isSchoolDisc;
    });

    if (this.selectedBiblioCourseId && this.selectedBiblioCourseId !== 'todos') {
      const allowedDiscIds = new Set(availableDisciplines.map(d => d.id));
      filteredList = filteredList.filter(b => {
        const bCourseId = this.getBiblioCourseId(b);
        return (bCourseId === this.selectedBiblioCourseId) || (b.disciplineId && allowedDiscIds.has(b.disciplineId));
      });
    }

    if (this.selectedBiblioDisciplineId && this.selectedBiblioDisciplineId !== 'todas') {
      filteredList = filteredList.filter(b => b.disciplineId === this.selectedBiblioDisciplineId);
    }

    // Atualizar títulos e subtítulos
    const listTitle = document.getElementById('biblio-list-title');
    const listSubtitle = document.getElementById('biblio-list-subtitle');
    if (listTitle) {
      const selectedCourse = courses.find(c => c.id === this.selectedBiblioCourseId);
      const selectedDisc = availableDisciplines.find(d => d.id === this.selectedBiblioDisciplineId);
      if (selectedDisc) {
        listTitle.innerHTML = `<i class="fa-solid fa-lines-leaning"></i> Bibliografia: ${selectedDisc.name}`;
      } else if (selectedCourse) {
        listTitle.innerHTML = `<i class="fa-solid fa-lines-leaning"></i> Bibliografia do Curso: ${selectedCourse.name}`;
      } else {
        listTitle.innerHTML = `<i class="fa-solid fa-lines-leaning"></i> Referências Bibliográficas`;
      }
    }
    if (listSubtitle) {
      listSubtitle.textContent = `Mostrando ${filteredList.length} referência(s) cadastrada(s).`;
    }

    if (filteredList.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 8px;">
          <i class="fa-solid fa-book-open" style="font-size: 2.4rem; margin-bottom: 0.75rem; opacity: 0.5; color: var(--primary);"></i>
          <h4 style="font-size: 1.05rem; margin-bottom: 0.35rem; color: var(--text-main);">Nenhuma referência encontrada</h4>
          <p style="margin: 0; font-size: 0.88rem;">Não foram encontradas referências bibliográficas com os filtros selecionados.</p>
        </div>
      `;
      return;
    }

    const canManage = ['professor', 'gestao', 'secretaria'].includes(this.currentRole);

    container.innerHTML = filteredList.map(b => {
      const disc = (this.state.disciplines || []).find(d => d.id === b.disciplineId);
      const discLabel = disc ? (disc.code ? `${disc.code} - ${disc.name}` : disc.name) : 'Disciplina Geral';
      const bCourseId = this.getBiblioCourseId(b);
      const course = (this.state.courses || []).find(c => c.id === bCourseId);
      const courseLabel = course ? course.name : null;
      const isBasica = b.type === 'Básica';

      return `
        <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem; background: var(--bg-card); box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.75rem;">
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center;">
                <span class="badge ${isBasica ? 'badge-primary' : 'badge-info'}">
                  <i class="fa-solid ${isBasica ? 'fa-bookmark' : 'fa-book-bookmark'}"></i> ${b.type || 'Básica'}
                </span>
                ${courseLabel ? `
                  <span class="badge" style="background: rgba(var(--primary-rgb, 59, 130, 246), 0.1); color: var(--primary); border: 1px solid rgba(var(--primary-rgb, 59, 130, 246), 0.2); font-size: 0.75rem;">
                    <i class="fa-solid fa-graduation-cap"></i> ${courseLabel}
                  </span>
                ` : ''}
                <span class="badge" style="background: var(--bg-card-secondary); color: var(--text-secondary); border: 1px solid var(--border-color); font-size: 0.75rem;">
                  <i class="fa-solid fa-book-open"></i> ${discLabel}
                </span>
              </div>
              ${canManage ? `
                <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                  <button type="button" class="action-btn-circle" onclick="app.openBiblioModal('${b.id}')" title="Editar Referência" style="color: var(--primary); border-color: var(--primary);">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button type="button" class="action-btn-circle delete-btn" onclick="app.deleteBiblio('${b.id}')" title="Excluir Referência">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              ` : ''}
            </div>
            <h4 style="font-size: 1.05rem; font-family: var(--font-heading); color: var(--text-main); margin-bottom: 0.5rem; line-height: 1.35;">
              ${b.title}
            </h4>
            <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
              <i class="fa-solid fa-pen-nib" style="color: var(--primary); opacity: 0.8;"></i>
              <span>Autor(es): <strong style="color: var(--text-main);">${b.author}</strong></span>
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  openBiblioModal(biblioId = null) {
    if (!this.checkPermission(['professor', 'gestao', 'secretaria'], 'gerenciar referências bibliográficas')) return;

    const modal = document.getElementById('modal-biblio');
    if (!modal) return;

    const activeSchool = this.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;
    const { availableCourses } = this.getTeacherAvailableCoursesAndClasses();
    const courses = (availableCourses && availableCourses.length > 0)
      ? availableCourses
      : (this.state.courses || []).filter(c => !c.schoolId || c.schoolId === schoolId);

    const courseSelect = document.getElementById('biblio-modal-curso');
    const discSelect = document.getElementById('biblio-disciplina');
    const idInput = document.getElementById('biblio-id');
    const titleInput = document.getElementById('biblio-titulo');
    const authorInput = document.getElementById('biblio-autor');
    const typeSelect = document.getElementById('biblio-tipo');
    const modalTitle = document.getElementById('modal-biblio-title');
    const saveBtn = document.getElementById('btn-save-biblio');

    // Preencher opções de cursos no modal
    if (courseSelect) {
      courseSelect.innerHTML = courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    if (biblioId) {
      const bib = (this.state.bibliographies || []).find(b => b.id === biblioId);
      if (bib) {
        if (idInput) idInput.value = bib.id;
        const targetCourseId = bib.courseId || this.getBiblioCourseId(bib) || (courses[0] ? courses[0].id : '');
        if (courseSelect) courseSelect.value = targetCourseId;

        // Atualizar disciplinas com base no curso da referência
        if (discSelect) {
          let discs = this.getCourseDisciplines(targetCourseId);
          if (bib.disciplineId && !discs.some(d => d.id === bib.disciplineId)) {
            const specificDisc = (this.state.disciplines || []).find(d => d.id === bib.disciplineId);
            if (specificDisc) discs = [specificDisc, ...discs];
          }
          discSelect.innerHTML = discs.map(d => `<option value="${d.id}">${d.code ? d.code + ' - ' : ''}${d.name}</option>`).join('');
          discSelect.value = bib.disciplineId || (discSelect.options[0] ? discSelect.options[0].value : '');
        }

        if (titleInput) titleInput.value = bib.title || '';
        if (authorInput) authorInput.value = bib.author || '';
        if (typeSelect) typeSelect.value = bib.type || 'Básica';
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Referência Bibliográfica';
        if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Alterações';
      }
    } else {
      if (idInput) idInput.value = '';

      // Default: se houver curso filtrado na tela, usa ele; senão usa o primeiro curso
      const defaultCourseId = (this.selectedBiblioCourseId && this.selectedBiblioCourseId !== 'todos')
        ? this.selectedBiblioCourseId
        : (courses[0] ? courses[0].id : '');

      if (courseSelect) courseSelect.value = defaultCourseId;

      // Popula disciplinas do curso selecionado
      if (discSelect) {
        const discs = this.getCourseDisciplines(defaultCourseId);
        discSelect.innerHTML = discs.map(d => `<option value="${d.id}">${d.code ? d.code + ' - ' : ''}${d.name}</option>`).join('');

        // Se houver disciplina filtrada na tela, pré-seleciona ela
        if (this.selectedBiblioDisciplineId && this.selectedBiblioDisciplineId !== 'todas') {
          discSelect.value = this.selectedBiblioDisciplineId;
        }
      }

      if (titleInput) titleInput.value = '';
      if (authorInput) authorInput.value = '';
      if (typeSelect) typeSelect.value = 'Básica';
      if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-lines-leaning"></i> Adicionar Referência Bibliográfica';
      if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar Obra';
    }

    modal.classList.add('open');
  }

  handleSaveBiblio(e) {
    e.preventDefault();
    if (!this.checkPermission(['professor', 'gestao', 'secretaria'], 'gerenciar referências bibliográficas')) return;

    const idInput = document.getElementById('biblio-id');
    const biblioId = idInput ? idInput.value.trim() : '';
    const courseId = document.getElementById('biblio-modal-curso') ? document.getElementById('biblio-modal-curso').value : '';
    const disciplineId = document.getElementById('biblio-disciplina') ? document.getElementById('biblio-disciplina').value : '';
    const title = document.getElementById('biblio-titulo') ? document.getElementById('biblio-titulo').value.trim() : '';
    const author = document.getElementById('biblio-autor') ? document.getElementById('biblio-autor').value.trim() : '';
    const type = document.getElementById('biblio-tipo') ? document.getElementById('biblio-tipo').value : 'Básica';

    if (!title || !author || !disciplineId) {
      this.showToast('Preencha todos os campos obrigatórios.', 'warning');
      return;
    }

    if (!this.state.bibliographies) this.state.bibliographies = [];

    if (biblioId) {
      const bib = this.state.bibliographies.find(b => b.id === biblioId);
      if (bib) {
        bib.courseId = courseId;
        bib.disciplineId = disciplineId;
        bib.title = title;
        bib.author = author;
        bib.type = type;
        this.showToast('Referência bibliográfica atualizada com sucesso!', 'success');
      }
    } else {
      const newBib = {
        id: 'bib_' + Date.now(),
        courseId,
        disciplineId,
        title,
        author,
        type
      };
      this.state.bibliographies.push(newBib);
      this.showToast('Referência bibliográfica cadastrada com sucesso!', 'success');
    }

    this.saveState();
    this.closeModal('modal-biblio');
    this.renderBiblioList();
  }

  async deleteBiblio(id) {
    if (!this.checkPermission(['professor', 'gestao', 'secretaria'], 'excluir referências bibliográficas')) return;

    const bib = (this.state.bibliographies || []).find(b => b.id === id);
    const bibTitle = bib ? `"${bib.title}"` : 'esta referência';

    const confirmed = await this.confirmAction({
      title: 'Excluir Referência Bibliográfica',
      message: `Deseja realmente excluir a obra ${bibTitle}?`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.bibliographies = (this.state.bibliographies || []).filter(b => b.id !== id);
      this.saveState();
      this.showToast('Referência bibliográfica excluída com sucesso.', 'success');
      this.renderBiblioList();
    }
  }

  handleScheduleCourseChange() {
    const courseSelect = document.getElementById('schedule-filter-curso');
    if (courseSelect) {
      this.selectedScheduleCourseId = courseSelect.value;
      this.selectedScheduleTurmaId = 'todas';
      this.renderScheduleTable();
    }
  }

  handleScheduleTurmaChange() {
    const turmaSelect = document.getElementById('schedule-filter-turma');
    if (turmaSelect) {
      this.selectedScheduleTurmaId = turmaSelect.value;
      this.renderScheduleTable();
    }
  }

  setScheduleView(mode) {
    this.scheduleViewMode = mode;
    const btnGrid = document.getElementById('btn-sch-grid');
    const btnList = document.getElementById('btn-sch-list');
    if (btnGrid && btnList) {
      if (mode === 'grid') {
        btnGrid.className = 'btn btn-sm btn-primary';
        btnGrid.style.background = '';
        btnGrid.style.color = '';
        btnList.className = 'btn btn-sm';
        btnList.style.background = 'transparent';
        btnList.style.color = 'var(--text-muted)';
      } else {
        btnGrid.className = 'btn btn-sm';
        btnGrid.style.background = 'transparent';
        btnGrid.style.color = 'var(--text-muted)';
        btnList.className = 'btn btn-sm btn-primary';
        btnList.style.background = '';
        btnList.style.color = '';
      }
    }
    this.renderScheduleTable();
  }

  getDisciplineColor(key) {
    const palette = [
      { bg: '#fef9c3', border: '#eab308', text: '#713f12', badge: '#fef08a' }, // Amarelo (como PGC101)
      { bg: '#fed7aa', border: '#f97316', text: '#7c2d12', badge: '#ffedd5' }, // Laranja (como PGC304)
      { bg: '#dcfce7', border: '#22c55e', text: '#14532d', badge: '#bbf7d0' }, // Verde Claro (como PGC301B)
      { bg: '#e0f2fe', border: '#0ea5e9', text: '#0c4a6e', badge: '#bae6fd' }, // Azul Claro (como PGC305E)
      { bg: '#f3e8ff', border: '#a855f7', text: '#581c87', badge: '#e9d5ff' }, // Lilás / Roxo
      { bg: '#ffe4e6', border: '#f43f5e', text: '#881337', badge: '#fecdd3' }, // Rosa / Rose
      { bg: '#ccfbf1', border: '#14b8a6', text: '#134e4a', badge: '#99f6e4' }, // Ciano / Menta
      { bg: '#e0e7ff', border: '#6366f1', text: '#312e81', badge: '#c7d2fe' }  // Azul Índigo
    ];

    if (!key) return palette[0];
    let hash = 0;
    const str = String(key);
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  }

  selectScheduleCourse(courseId) {
    this.selectedScheduleCourseId = courseId;
    this.selectedScheduleTurmaId = 'todas';
    this.renderScheduleTable();
  }

  /* --- Quadro de Horários & Grade Curricular (Modelo Matriz Universitária) --- */
  renderScheduleTable() {
    const courseSelect = document.getElementById('schedule-filter-curso');
    const turmaSelect = document.getElementById('schedule-filter-turma');
    const container = document.getElementById('schedule-turmas-view-container');
    if (!container) return;

    const activeSchool = this.getActiveSchool();
    if (!this.state.schedules) this.state.schedules = [];
    const allSchedules = this.state.schedules.filter(s => s.schoolId === activeSchool.id);
    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
    const schoolTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id);
    const currentUserId = this.currentUser ? this.currentUser.id : null;

    // Sincronizar botões de alternância de visão
    const btnGrid = document.getElementById('btn-sch-grid');
    const btnList = document.getElementById('btn-sch-list');
    if (btnGrid && btnList) {
      if (this.scheduleViewMode === 'grid') {
        btnGrid.className = 'btn btn-sm btn-primary';
        btnGrid.style.background = '';
        btnGrid.style.color = '';
        btnList.className = 'btn btn-sm';
        btnList.style.background = 'transparent';
        btnList.style.color = 'var(--text-muted)';
      } else {
        btnGrid.className = 'btn btn-sm';
        btnGrid.style.background = 'transparent';
        btnGrid.style.color = 'var(--text-muted)';
        btnList.className = 'btn btn-sm btn-primary';
        btnList.style.background = '';
        btnList.style.color = '';
      }
    }

    // Context badge
    const badgeEl = document.getElementById('schedule-role-context-badge');
    if (badgeEl) {
      if (this.currentRole === 'professor') {
        badgeEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Visão Docente`;
      } else if (this.currentRole === 'aluno') {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Horários da sua turma`;
      } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-clock"></i> Quadro de Horários`;
      }
    }

    // 1. Preencher seletor de Cursos (Filtro)
    if (this.currentRole === 'aluno') {
      const student = (this.currentUser && this.currentUser.tipo === 'aluno') ? this.currentUser : this.state.users.find(u => u.tipo === 'aluno');
      const studentCourse = student ? schoolCourses.find(c => c.id === student.cursoId) : null;
      if (courseSelect) {
        if (studentCourse) {
          courseSelect.innerHTML = `<option value="${studentCourse.id}">Meu Curso: ${this.escapeHTML(studentCourse.name)}</option>`;
          courseSelect.value = studentCourse.id;
          courseSelect.disabled = true;
          this.selectedScheduleCourseId = studentCourse.id;
        }
      }
    } else {
      if (courseSelect) {
        courseSelect.disabled = false;
        let options = `<option value="todos">Todos os Cursos</option>`;
        options += schoolCourses.map(c => `<option value="${c.id}">${this.escapeHTML(c.name)}</option>`).join('');
        courseSelect.innerHTML = options;

        if (!this.selectedScheduleCourseId || (this.selectedScheduleCourseId !== 'todos' && !schoolCourses.some(c => c.id === this.selectedScheduleCourseId))) {
          this.selectedScheduleCourseId = 'todos';
        }
        courseSelect.value = this.selectedScheduleCourseId;
      }
    }

    // 2. Preencher seletor de Turmas (Filtro)
    let relevantTurmas = (this.selectedScheduleCourseId && this.selectedScheduleCourseId !== 'todos')
      ? schoolTurmas.filter(t => t.courseId === this.selectedScheduleCourseId)
      : schoolTurmas;

    // Se for Aluno, restringir rigorosamente às turmas em que ele está matriculado
    if (this.currentRole === 'aluno') {
      const student = (this.currentUser && this.currentUser.tipo === 'aluno') ? this.currentUser : this.state.users.find(u => u.tipo === 'aluno');
      if (student) {
        const myTurmas = schoolTurmas.filter(t => t.studentIds && Array.isArray(t.studentIds) && t.studentIds.includes(student.id));
        if (myTurmas.length > 0) {
          relevantTurmas = myTurmas;
        }
      }
    }

    if (turmaSelect) {
      if (this.currentRole === 'aluno') {
        let tOptions = relevantTurmas.length > 1 ? `<option value="todas">Todas as Minhas Turmas (${relevantTurmas.length})</option>` : '';
        tOptions += relevantTurmas.map(t => `<option value="${t.id}">Minha Turma: ${this.escapeHTML(t.nome)}</option>`).join('');
        turmaSelect.innerHTML = tOptions || `<option value="">Nenhuma turma vinculada</option>`;
        if (relevantTurmas.length === 1) {
          this.selectedScheduleTurmaId = relevantTurmas[0].id;
        } else if (!this.selectedScheduleTurmaId || (this.selectedScheduleTurmaId !== 'todas' && !relevantTurmas.some(t => t.id === this.selectedScheduleTurmaId))) {
          this.selectedScheduleTurmaId = relevantTurmas[0]?.id || 'todas';
        }
      } else {
        let tOptions = `<option value="todas">Todas as Turmas (${relevantTurmas.length})</option>`;
        tOptions += relevantTurmas.map(t => {
          const c = schoolCourses.find(course => course.id === t.courseId);
          const prefix = c ? `[${c.name}] ` : '';
          return `<option value="${t.id}">${prefix}${t.nome} (${t.turno || t.shift || 'Geral'})</option>`;
        }).join('');
        turmaSelect.innerHTML = tOptions;

        if (!this.selectedScheduleTurmaId || (this.selectedScheduleTurmaId !== 'todas' && !relevantTurmas.some(t => t.id === this.selectedScheduleTurmaId))) {
          this.selectedScheduleTurmaId = 'todas';
        }
      }
      turmaSelect.value = this.selectedScheduleTurmaId;
    }

    // 3. Filtrar Turmas a exibir conforme seleções
    let displayTurmas = relevantTurmas;
    if (this.selectedScheduleTurmaId && this.selectedScheduleTurmaId !== 'todas') {
      displayTurmas = relevantTurmas.filter(t => t.id === this.selectedScheduleTurmaId);
    }

    const daysOrder = {
      'Segunda-feira': 1,
      'Terça-feira': 2,
      'Quarta-feira': 3,
      'Quinta-feira': 4,
      'Sexta-feira': 5,
      'Sábado': 6,
      'Domingo': 7
    };

    // Calcular estatísticas rápidas da seleção
    let totalAllSchedules = 0;
    const diasComAula = new Set();
    const uniqueRooms = new Set();
    const uniqueProfessores = new Set();

    displayTurmas.forEach(turma => {
      this.ensureTurmaDisciplines(turma);
      allSchedules.forEach(s => {
        const [tId, tdId] = (s.turmaId || '').split('__');
        let belongs = (tId === turma.id);
        if (!belongs) {
          const originTurma = schoolTurmas.find(t => t.id === tId);
          if (originTurma && originTurma.disciplines) {
            this.ensureTurmaDisciplines(originTurma);
            const originTd = originTurma.disciplines.find(d => d.id === tdId);
            if (originTd && Array.isArray(originTd.sharedWithTurmaIds) && originTd.sharedWithTurmaIds.includes(turma.id)) {
              belongs = true;
            }
          }
        }
        if (belongs) {
          totalAllSchedules++;
          if (s.dayOfWeek) diasComAula.add(s.dayOfWeek);
          if (s.room) uniqueRooms.add(s.room);
          const originTurma = schoolTurmas.find(t => t.id === tId);
          if (originTurma && originTurma.disciplines && tdId) {
            const td = originTurma.disciplines.find(d => d.id === tdId);
            if (td && td.teacherId) uniqueProfessores.add(td.teacherId);
          }
        }
      });
    });

    const kpiEl = document.getElementById('schedule-kpi-summary');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <span class="sch-kpi-chip"><i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> <strong>${totalAllSchedules}</strong> aula(s) cadastrada(s)</span>
        <span class="sch-kpi-chip"><i class="fa-solid fa-calendar-week" style="color:var(--accent);"></i> <strong>${diasComAula.size}</strong> dia(s) com aulas</span>
        <span class="sch-kpi-chip"><i class="fa-solid fa-users" style="color:var(--info);"></i> <strong>${displayTurmas.length}</strong> turma(s) listada(s)</span>
        <span class="sch-kpi-chip"><i class="fa-solid fa-chalkboard-user" style="color:var(--success);"></i> <strong>${uniqueProfessores.size}</strong> professor(es)</span>
        <span class="sch-kpi-chip"><i class="fa-solid fa-door-open" style="color:var(--warning);"></i> <strong>${uniqueRooms.size}</strong> sala(s)/lab(s)</span>
      `;
    }

    if (displayTurmas.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted); background: var(--bg-card); border-radius: var(--border-radius);">
          <i class="fa-solid fa-calendar-xmark" style="font-size: 2.75rem; margin-bottom: 0.85rem; color: var(--text-light);"></i>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">Nenhuma turma encontrada</h4>
          <p style="font-size: 0.88rem; max-width: 460px; margin: 0 auto 1.25rem;">
            Não há turmas cadastradas para o curso selecionado. Crie turmas para vincular disciplinas e horários semanais.
          </p>
          <button class="btn btn-primary btn-sm role-access-gestao role-access-secretaria" onclick="app.switchTab('tab-turmas')">
            <i class="fa-solid fa-users"></i> Gerenciar Turmas & Vínculos
          </button>
        </div>
      `;
      this.updateNavVisibility();
      return;
    }

    container.innerHTML = displayTurmas.map(turma => {
      this.ensureTurmaDisciplines(turma);
      const course = this.state.courses.find(c => c.id === turma.courseId);
      const activeDiscs = (turma.disciplines || []).filter(d => d.status !== 'arquivada');

      const turmaSchedules = allSchedules.filter(s => {
        const [tId, tdId] = (s.turmaId || '').split('__');
        if (tId === turma.id) return true;

        const originTurma = schoolTurmas.find(t => t.id === tId);
        if (originTurma && originTurma.disciplines) {
          this.ensureTurmaDisciplines(originTurma);
          const originTd = originTurma.disciplines.find(d => d.id === tdId);
          if (originTd && Array.isArray(originTd.sharedWithTurmaIds) && originTd.sharedWithTurmaIds.includes(turma.id)) {
            return true;
          }
        }
        return false;
      }).sort((a, b) => {
        const dayDiff = (daysOrder[a.dayOfWeek] || 99) - (daysOrder[b.dayOfWeek] || 99);
        if (dayDiff !== 0) return dayDiff;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });

      // Renderização do Modo Grade Matriz (Modelo da Imagem Universitária: Eixo X = Dias, Eixo Y = Horários)
      const renderWeekMatrix = () => {
        if (turmaSchedules.length === 0) {
          return `
            <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--bg-main, #f8fafc); border-radius: 8px; border: 1px dashed var(--border-color); margin: 1rem 1.25rem;">
              <i class="fa-regular fa-calendar-xmark" style="font-size: 2.2rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
              <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">Nenhum horário cadastrado para ${this.escapeHTML(turma.nome)}</h4>
              <p style="margin: 0 0 1rem 0; font-size: 0.88rem;">Cadastre as aulas para visualizar a grade semanal no modelo matriz.</p>
              <button class="btn btn-primary btn-sm role-access-gestao role-access-secretaria" onclick="app.openScheduleModal('${turma.courseId || ''}', '${turma.id}')">
                <i class="fa-solid fa-plus"></i> Cadastrar primeiro horário
              </button>
            </div>
          `;
        }

        // Dias da semana da matriz (Segunda-feira a Sábado por padrão)
        const matrixDays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

        // Extrair intervalos únicos de horários ordenados cronologicamente
        const uniqueSlotsMap = new Map();
        turmaSchedules.forEach(s => {
          const start = s.startTime || '19:00';
          const end = s.endTime || '20:40';
          const key = `${start} - ${end}`;
          if (!uniqueSlotsMap.has(key)) {
            uniqueSlotsMap.set(key, { startTime: start, endTime: end, label: key });
          }
        });

        const timeSlots = Array.from(uniqueSlotsMap.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Coletar disciplinas únicas para a legenda visual
        const legendMap = new Map();

        return `
          <div class="sch-matrix-wrapper">
            <table class="sch-matrix-table">
              <thead>
                <tr>
                  <th class="sch-matrix-header-time"><i class="fa-solid fa-clock"></i> Horário</th>
                  ${matrixDays.map(day => `
                    <th class="sch-matrix-header-day">${day}</th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${timeSlots.map(slot => `
                  <tr>
                    <!-- Coluna de Horário (Eixo Y à esquerda) -->
                    <td class="sch-matrix-time-col">
                      <span class="sch-matrix-time-text">${slot.startTime}</span>
                      <span class="sch-matrix-time-divider">-</span>
                      <span class="sch-matrix-time-text">${slot.endTime}</span>
                    </td>

                    <!-- Colunas dos Dias da Semana (Segunda a Sexta/Sábado) -->
                    ${matrixDays.map(day => {
                      const matches = turmaSchedules.filter(s => s.dayOfWeek === day && s.startTime === slot.startTime);
                      if (matches.length === 0) {
                        return `
                          <td class="sch-matrix-cell empty-cell">
                            <div class="sch-empty-slot role-access-gestao role-access-secretaria" onclick="app.openScheduleModal('${turma.courseId || ''}', '${turma.id}', '${day}', '${slot.startTime}', '${slot.endTime}')" title="Clique para cadastrar aula em ${day} às ${slot.startTime}">
                              <i class="fa-solid fa-plus"></i>
                            </div>
                          </td>
                        `;
                      }

                      return `
                        <td class="sch-matrix-cell has-class">
                          ${matches.map(sch => {
                            const [tId, tdId] = (sch.turmaId || '').split('__');
                            const isFromOtherTurma = tId !== turma.id;
                            const originTurma = isFromOtherTurma ? schoolTurmas.find(t => t.id === tId) : turma;

                            let disc = null;
                            let teacher = null;
                            let period = '';
                            let isShared = false;
                            let sharedNames = '';

                            if (originTurma && originTurma.disciplines) {
                              this.ensureTurmaDisciplines(originTurma);
                              if (tdId) {
                                const td = originTurma.disciplines.find(d => d.id === tdId);
                                if (td) {
                                  disc = this.state.disciplines.find(d => d.id === td.disciplineId);
                                  teacher = this.state.users.find(u => u.id === td.teacherId);
                                  period = td.periodo || '';
                                  if (Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0) {
                                    isShared = true;
                                    sharedNames = td.sharedWithTurmaIds.map(sId => {
                                      const st = schoolTurmas.find(item => item.id === sId);
                                      return st ? st.nome : '';
                                    }).filter(Boolean).join(', ');
                                  }
                                }
                              }
                              if (!disc) disc = this.state.disciplines.find(d => d.id === originTurma.disciplineId);
                              if (!teacher) teacher = this.state.users.find(u => u.id === originTurma.teacherId);
                            }

                            const isMyClass = this.currentRole === 'professor' && currentUserId && teacher && teacher.id === currentUserId;
                            const discKey = disc ? (disc.id || disc.name) : 'Geral';
                            const color = this.getDisciplineColor(discKey);

                            if (disc && !legendMap.has(discKey)) {
                              legendMap.set(discKey, { name: disc.name, code: disc.code || '', color });
                            }

                            return `
                              <div class="sch-matrix-block" style="background:${color.bg}; border:1.5px solid ${color.border}; color:${color.text};">
                                ${disc && disc.code ? `<div class="sch-matrix-code">${this.escapeHTML(disc.code)}</div>` : ''}
                                <div class="sch-matrix-title">
                                  ${disc ? this.escapeHTML(disc.name) : 'Disciplina Geral'}
                                </div>
                                <div class="sch-matrix-sub">
                                  <span><i class="fa-solid fa-chalkboard-user"></i> ${teacher ? this.escapeHTML(teacher.nome) : 'Não informado'}</span>
                                  ${isMyClass ? `<span class="badge badge-success" style="font-size:0.65rem; padding:1px 5px;"><i class="fa-solid fa-user-check"></i> Você</span>` : ''}
                                </div>
                                <div class="sch-matrix-room">
                                  <i class="fa-solid fa-location-dot"></i> ${this.escapeHTML(sch.room || 'Sala não definida')}
                                </div>
                                ${isFromOtherTurma ? `
                                  <div style="font-size:0.7rem; font-weight:600; margin-top:2px;">
                                    <i class="fa-solid fa-people-arrows"></i> Conjunta: ${this.escapeHTML(originTurma ? originTurma.nome : '')}
                                  </div>
                                ` : (isShared ? `
                                  <div style="font-size:0.7rem; font-weight:600; margin-top:2px;">
                                    <i class="fa-solid fa-people-arrows"></i> Conjunta (c/ ${this.escapeHTML(sharedNames)})
                                  </div>
                                ` : '')}
                                <div class="sch-matrix-actions role-access-gestao role-access-secretaria">
                                  <button class="action-btn-circle" onclick="app.editSchedule('${sch.id}')" title="Editar Horário">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                  </button>
                                  <button class="action-btn-circle delete-btn" onclick="app.deleteSchedule('${sch.id}')" title="Excluir Horário">
                                    <i class="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </div>
                            `;
                          }).join('')}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- Legenda das Disciplinas da Turma -->
            ${legendMap.size > 0 ? `
              <div class="sch-matrix-legend">
                <span style="font-weight:700; color:var(--text-main); margin-right:6px;"><i class="fa-solid fa-palette"></i> Disciplinas:</span>
                ${Array.from(legendMap.values()).map(l => `
                  <span class="sch-matrix-legend-item" style="background:${l.color.bg}; border-color:${l.color.border}; color:${l.color.text};">
                    ${l.code ? `<strong>${this.escapeHTML(l.code)}:</strong>` : ''} ${this.escapeHTML(l.name)}
                  </span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      };

      // Renderização do Modo Lista Detalhada
      const renderListView = () => {
        if (turmaSchedules.length === 0) {
          return `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); background: var(--bg-main, #f8fafc); border-radius: 8px; border: 1px dashed var(--border-color); margin: 1rem 1.25rem;">
              <i class="fa-regular fa-calendar-xmark" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.4;"></i>
              <p style="margin: 0; font-size: 0.88rem;">Nenhum horário de aula cadastrado para a turma <strong>${this.escapeHTML(turma.nome)}</strong>.</p>
              <button class="btn btn-secondary btn-sm role-access-gestao role-access-secretaria" style="margin-top: 0.6rem;" onclick="app.openScheduleModal('${turma.courseId || ''}', '${turma.id}')">
                <i class="fa-solid fa-plus"></i> Cadastrar primeiro horário
              </button>
            </div>
          `;
        }

        return `
          <div style="padding: 1rem 1.25rem;">
            <div class="table-responsive">
              <table class="table" style="margin-bottom: 0;">
                <thead>
                  <tr>
                    <th>Dia da Semana</th>
                    <th>Horário</th>
                    <th>Disciplina / Período</th>
                    <th>Professor</th>
                    <th>Local / Sala</th>
                    <th class="role-access-gestao role-access-secretaria" style="text-align: right;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${turmaSchedules.map(sch => {
                    const [tId, tdId] = (sch.turmaId || '').split('__');
                    const isFromOtherTurma = tId !== turma.id;
                    const originTurma = isFromOtherTurma ? schoolTurmas.find(t => t.id === tId) : turma;

                    let disc = null;
                    let teacher = null;
                    let period = '';
                    let isShared = false;
                    let sharedNames = '';

                    if (originTurma && originTurma.disciplines) {
                      this.ensureTurmaDisciplines(originTurma);
                      if (tdId) {
                        const td = originTurma.disciplines.find(d => d.id === tdId);
                        if (td) {
                          disc = this.state.disciplines.find(d => d.id === td.disciplineId);
                          teacher = this.state.users.find(u => u.id === td.teacherId);
                          period = td.periodo || '';
                          if (Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0) {
                            isShared = true;
                            sharedNames = td.sharedWithTurmaIds.map(sId => {
                              const st = schoolTurmas.find(item => item.id === sId);
                              return st ? st.nome : '';
                            }).filter(Boolean).join(', ');
                          }
                        }
                      }
                      if (!disc) disc = this.state.disciplines.find(d => d.id === originTurma.disciplineId);
                      if (!teacher) teacher = this.state.users.find(u => u.id === originTurma.teacherId);
                    }

                    const isMyClass = this.currentRole === 'professor' && currentUserId && teacher && teacher.id === currentUserId;

                    let jointBadge = '';
                    if (isFromOtherTurma) {
                      jointBadge = `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; border:1px solid rgba(99,102,241,0.3); font-size:0.72rem; margin-top:3px; display:inline-block;"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta (c/ ${this.escapeHTML(originTurma ? originTurma.nome : '')})</span>`;
                    } else if (isShared) {
                      jointBadge = `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; border:1px solid rgba(99,102,241,0.3); font-size:0.72rem; margin-top:3px; display:inline-block;"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta (c/ ${this.escapeHTML(sharedNames)})</span>`;
                    }

                    return `
                      <tr ${isMyClass ? 'style="background:rgba(16,185,129,0.03);"' : ''}>
                        <td><span class="badge badge-primary"><i class="fa-solid fa-calendar-day"></i> ${this.escapeHTML(sch.dayOfWeek)}</span></td>
                        <td><strong style="color:var(--primary);">${this.escapeHTML(sch.startTime)} - ${this.escapeHTML(sch.endTime)}</strong></td>
                        <td>
                          <strong style="color:var(--text-main);">${disc ? this.escapeHTML(disc.name) : 'Disciplina Geral'}</strong>
                          ${period ? `<span class="badge badge-secondary" style="font-size:0.7rem; margin-left:4px;">${this.escapeHTML(period)}</span>` : ''}
                          ${jointBadge ? `<div>${jointBadge}</div>` : ''}
                          ${disc && disc.code ? `<div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHTML(disc.code)}</div>` : ''}
                        </td>
                        <td>
                          <i class="fa-solid fa-chalkboard-user" style="color:var(--text-muted); margin-right:4px;"></i>
                          <span style="font-weight:${isMyClass ? '700' : '400'}; color:${isMyClass ? 'var(--success)' : 'inherit'};">
                            ${teacher ? this.escapeHTML(teacher.nome) : '<span style="color:var(--text-muted);">Não informado</span>'}
                          </span>
                          ${isMyClass ? `<span class="badge badge-success" style="font-size:0.68rem; margin-left:4px;"><i class="fa-solid fa-user-check"></i> Você</span>` : ''}
                        </td>
                        <td><span class="badge badge-info"><i class="fa-solid fa-location-dot"></i> ${this.escapeHTML(sch.room)}</span></td>
                        <td class="role-access-gestao role-access-secretaria" style="text-align: right;">
                          ${isFromOtherTurma 
                            ? `<span style="font-size:0.75rem; color:var(--text-muted);" title="Horário compartilhado em aula conjunta"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta</span>` 
                            : `<div style="display:flex;gap:6px;justify-content:flex-end;">
                                <button class="action-btn-circle" onclick="app.editSchedule('${sch.id}')" title="Editar Horário" style="color:var(--primary);border-color:var(--primary);"><i class="fa-solid fa-pen-to-square"></i></button>
                                <button class="action-btn-circle delete-btn" onclick="app.deleteSchedule('${sch.id}')" title="Excluir Horário"><i class="fa-solid fa-trash"></i></button>
                              </div>`}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      };

      return `
        <div class="sch-turma-card">
          <!-- Cabeçalho da Turma -->
          <div class="sch-turma-header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(79, 70, 229, 0.1); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-users"></i>
              </div>
              <div>
                <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                  ${this.escapeHTML(turma.nome)}
                  <span class="badge badge-primary" style="font-size: 0.72rem;">${this.escapeHTML(turma.turno || turma.shift || 'Integral')}</span>
                  ${turma.codigo ? `<span class="badge badge-secondary" style="font-size: 0.72rem;">${this.escapeHTML(turma.codigo)}</span>` : ''}
                </h4>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">
                  <i class="fa-solid fa-graduation-cap"></i> ${course ? this.escapeHTML(course.name) : 'Curso não associado'} • ${activeDiscs.length} disciplina(s) ativa(s)
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge ${turmaSchedules.length > 0 ? 'badge-info' : 'badge-secondary'}" style="font-size: 0.78rem; padding: 5px 10px;">
                <i class="fa-solid fa-clock"></i> ${turmaSchedules.length} aula(s) semanal(is)
              </span>
              <button class="btn btn-primary btn-sm role-access-gestao role-access-secretaria" onclick="app.openScheduleModal('${turma.courseId || ''}', '${turma.id}')" title="Adicionar Horário para esta Turma">
                <i class="fa-solid fa-plus"></i> Novo Horário
              </button>
            </div>
          </div>

          <!-- Conteúdo: Grade Matriz Semanal (Modelo Universitário) ou Lista -->
          ${this.scheduleViewMode === 'grid' ? renderWeekMatrix() : renderListView()}
        </div>
      `;
    }).join('');

    this.updateNavVisibility();
  }

  openScheduleModal(preselectedCourseId = null, preselectedTurmaId = null, preselectedDay = null, preselectedStart = null, preselectedEnd = null) {
    const activeSchool = this.getActiveSchool();
    const courseSelect = document.getElementById('sch-modal-curso');
    if (!courseSelect) return;

    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
    if (schoolCourses.length === 0) {
      this.showToast('Cadastre ao menos um curso antes de criar horários de aula.', 'warning');
      return;
    }

    courseSelect.innerHTML = `<option value="">Selecione o Curso...</option>` +
      schoolCourses.map(c => `<option value="${c.id}">${this.escapeHTML(c.code)} - ${this.escapeHTML(c.name)}</option>`).join('');

    // Pre-seleção do curso
    let courseToSelect = preselectedCourseId;
    if (!courseToSelect && this.selectedScheduleCourseId && this.selectedScheduleCourseId !== 'todos') {
      courseToSelect = this.selectedScheduleCourseId;
    }
    if (!courseToSelect && schoolCourses.length > 0) {
      courseToSelect = schoolCourses[0].id;
    }
    courseSelect.value = courseToSelect || '';

    // Disparar cascata para carregar turmas
    this.handleScheduleModalCourseChange(preselectedTurmaId);

    // Resetar campos de dia, sala e horários
    const diaSelect = document.getElementById('sch-dia');
    if (diaSelect) diaSelect.value = preselectedDay || 'Segunda-feira';
    const localInput = document.getElementById('sch-local');
    if (localInput) localInput.value = '';
    const inicioInput = document.getElementById('sch-inicio');
    if (inicioInput) inicioInput.value = preselectedStart || '19:00';
    const fimInput = document.getElementById('sch-fim');
    if (fimInput) fimInput.value = preselectedEnd || '20:40';

    const editIdEl = document.getElementById('sch-edit-id');
    if (editIdEl) editIdEl.value = '';
    const titleEl = document.getElementById('modal-schedule-title');
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-clock"></i> Cadastrar Horário de Aula';
    const saveBtn = document.getElementById('btn-save-schedule');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Horário';

    document.getElementById('modal-schedule').classList.add('open');
  }

  handleScheduleModalCourseChange(preselectedTurmaId = null) {
    const activeSchool = this.getActiveSchool();
    const courseSelect = document.getElementById('sch-modal-curso');
    const turmaSelect = document.getElementById('sch-modal-turma');
    if (!courseSelect || !turmaSelect) return;

    const selectedCourseId = courseSelect.value;
    const courseTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id && (!selectedCourseId || t.courseId === selectedCourseId));

    if (courseTurmas.length === 0) {
      turmaSelect.innerHTML = `<option value="">Nenhuma turma encontrada para este curso</option>`;
      this.handleScheduleModalTurmaChange();
      return;
    }

    turmaSelect.innerHTML = `<option value="">Selecione a Turma...</option>` +
      courseTurmas.map(t => `<option value="${t.id}">${this.escapeHTML(t.nome)} (${this.escapeHTML(t.turno || 'Integral')})</option>`).join('');

    let turmaToSelect = preselectedTurmaId;
    if (!turmaToSelect || !courseTurmas.some(t => t.id === turmaToSelect)) {
      turmaToSelect = courseTurmas[0].id;
    }
    turmaSelect.value = turmaToSelect || '';

    // Disparar cascata para carregar disciplinas ativas da turma
    this.handleScheduleModalTurmaChange();
  }

  handleScheduleModalTurmaChange() {
    const turmaSelect = document.getElementById('sch-modal-turma');
    const discSelect = document.getElementById('sch-modal-disciplina');
    if (!turmaSelect || !discSelect) return;

    const selectedTurmaId = turmaSelect.value;
    if (!selectedTurmaId) {
      discSelect.innerHTML = `<option value="">Selecione uma turma primeiro</option>`;
      return;
    }

    const turma = this.state.classes.find(t => t.id === selectedTurmaId);
    if (!turma) {
      discSelect.innerHTML = `<option value="">Turma não encontrada</option>`;
      return;
    }

    this.ensureTurmaDisciplines(turma);
    // Filtrar APENAS disciplinas ativas (evita disciplinas arquivadas)
    const activeDiscs = (turma.disciplines || []).filter(d => d.status !== 'arquivada');

    if (activeDiscs.length === 0) {
      // Caso a turma não tenha disciplinas cadastradas no modelo novo
      if (turma.disciplineId) {
        const d = this.state.disciplines.find(disc => disc.id === turma.disciplineId);
        discSelect.innerHTML = `<option value="${turma.id}">${d ? this.escapeHTML(d.name) : 'Disciplina Principal'}</option>`;
      } else {
        discSelect.innerHTML = `<option value="${turma.id}">(Horário geral da turma - sem disciplina específica)</option>`;
      }
      return;
    }

    discSelect.innerHTML = activeDiscs.map(td => {
      const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
      const teacher = this.state.users.find(u => u.id === td.teacherId);
      const discName = disc ? disc.name : 'Disciplina';
      const periodStr = td.periodo ? ` [${td.periodo}]` : '';
      const teacherStr = teacher ? ` - Prof: ${teacher.nome}` : '';
      const isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
      const sharedStr = isShared ? ' (Aula Conjunta)' : '';
      return `<option value="${turma.id}__${td.id}">${this.escapeHTML(discName)}${this.escapeHTML(periodStr)}${this.escapeHTML(teacherStr)}${sharedStr}</option>`;
    }).join('');
  }

  handleSaveSchedule(e) {
    e.preventDefault();
    const activeSchool = this.getActiveSchool();
    const discValue = document.getElementById('sch-modal-disciplina')?.value;
    const turmaValue = document.getElementById('sch-modal-turma')?.value;
    const dayOfWeek = document.getElementById('sch-dia').value;
    const room = document.getElementById('sch-local').value.trim();
    const startTime = document.getElementById('sch-inicio').value;
    const endTime = document.getElementById('sch-fim').value;
    const editId = document.getElementById('sch-edit-id')?.value;

    const finalTurmaId = discValue || turmaValue;
    if (!finalTurmaId) {
      this.showToast('Por favor, selecione uma turma e disciplina válidas.', 'warning');
      return;
    }

    if (!this.state.schedules) this.state.schedules = [];

    if (editId) {
      // Modo edição: atualizar registro existente
      const idx = this.state.schedules.findIndex(s => s.id === editId);
      if (idx !== -1) {
        this.state.schedules[idx] = {
          ...this.state.schedules[idx],
          turmaId: finalTurmaId,
          dayOfWeek,
          room,
          startTime,
          endTime
        };
      }
      this.saveState();
      this.closeModal('modal-schedule');
      this.showToast('Horário atualizado com sucesso!', 'success');
      this.render();
    } else {
      // Modo criação: adicionar novo registro
      const newSch = {
        id: 'sch_' + Date.now(),
        schoolId: activeSchool.id,
        turmaId: finalTurmaId,
        dayOfWeek,
        room,
        startTime,
        endTime
      };
      this.state.schedules.push(newSch);
      this.saveState();
      this.closeModal('modal-schedule');
      this.showToast('Horário de aula cadastrado com sucesso!', 'success');
      this.render();
    }
  }

  async deleteSchedule(id) {
    const confirmed = await this.confirmAction({
      title: 'Excluir Horário',
      message: 'Deseja realmente excluir este horário de aula?',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.schedules = this.state.schedules.filter(s => s.id !== id);
      this.saveState();
      this.showToast('Horário de aula excluído com sucesso.', 'success');
      this.render();
    }
  }

  editSchedule(id) {
    const sch = (this.state.schedules || []).find(s => s.id === id);
    if (!sch) {
      this.showToast('Horário não encontrado.', 'danger');
      return;
    }

    // Extrair turmaId e turma__disc separados
    const turmaIdFull = sch.turmaId || '';
    const [tId] = turmaIdFull.split('__');

    // Carregar turma para determinar curso
    const turma = this.state.classes.find(t => t.id === tId);
    const preselectedCourseId = turma ? turma.courseId : null;

    // Abrir modal com pré-seleção de curso e turma
    this.openScheduleModal(preselectedCourseId, tId);

    // Aguardar o DOM atualizar e pré-preencher os campos
    setTimeout(() => {
      const editIdEl = document.getElementById('sch-edit-id');
      if (editIdEl) editIdEl.value = id;

      // Pré-selecionar a disciplina
      const discSelect = document.getElementById('sch-modal-disciplina');
      if (discSelect && turmaIdFull) {
        discSelect.value = turmaIdFull;
      }

      // Pré-preencher demais campos
      const diaSelect = document.getElementById('sch-dia');
      if (diaSelect) diaSelect.value = sch.dayOfWeek;

      const localInput = document.getElementById('sch-local');
      if (localInput) localInput.value = sch.room || '';

      const inicioInput = document.getElementById('sch-inicio');
      if (inicioInput) inicioInput.value = sch.startTime;

      const fimInput = document.getElementById('sch-fim');
      if (fimInput) fimInput.value = sch.endTime;

      // Atualizar título e botão
      const titleEl = document.getElementById('modal-schedule-title');
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Horário de Aula';
      const saveBtn = document.getElementById('btn-save-schedule');
      if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Atualizar Horário';
    }, 50);
  }

  /* =========================================================================
     GRADE CURRICULAR / FLUXOGRAMA DINÂMICO (CORES AUTOMÁTICAS)
     ========================================================================= */
  getAutoCardColorClass(disc, index) {
    const seed = (disc ? (disc.code || disc.name || disc.id) : '') + '_' + index;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % 12;
    return `auto-color-${colorIndex}`;
  }

  syncCourseDisciplinesToCurriculum() {
    if (!this.state.curriculumGrid) this.state.curriculumGrid = [];

    // Para cada curso, sincroniza matérias das turmas que possam não estar ainda no grid
    (this.state.courses || []).forEach(course => {
      const courseTurmas = (this.state.classes || []).filter(t => t.courseId === course.id);
      courseTurmas.forEach(turma => {
        (turma.disciplines || []).forEach(td => {
          if (td.disciplineId && td.status !== 'arquivada') {
            const alreadyInGrid = this.state.curriculumGrid.some(cg => cg.courseId === course.id && cg.disciplineId === td.disciplineId);
            if (!alreadyInGrid) {
              let periodStr = td.periodo || '1º Período';
              if (periodStr.includes('1')) periodStr = '1º Período';
              else if (periodStr.includes('2')) periodStr = '2º Período';
              else if (!periodStr.toLowerCase().includes('período') && !periodStr.toLowerCase().includes('semestre')) {
                periodStr = '1º Período';
              }
              this.state.curriculumGrid.push({
                id: `cg_${course.id}_${td.disciplineId}`,
                courseId: course.id,
                period: periodStr,
                disciplineId: td.disciplineId
              });
            }
          }
        });
      });
    });
  }

  handleCurriculumCourseChange() {
    const courseSelect = document.getElementById('curriculum-filter-curso');
    if (courseSelect) {
      this.selectedCurriculumCourseId = courseSelect.value;
      this.renderCurriculumGrid();
    }
  }

  handleCurriculumDisciplineChange() {
    this.renderCurriculumGrid();
  }

  selectCurriculumCourse(courseId) {
    this.selectedCurriculumCourseId = courseId;
    this.renderCurriculumGrid();
  }

  renderCourseFlowchart(course, activeSchool, isGestao) {
    // 1. Matérias cadastradas no grid para este curso
    const courseItems = [...(this.state.curriculumGrid || []).filter(cg => cg.courseId === course.id)];

    // 2. Garantir que disciplinas vinculadas às turmas deste curso também constem
    const existingDiscIds = new Set(courseItems.map(ci => ci.disciplineId));
    const courseTurmas = (this.state.classes || []).filter(t => t.courseId === course.id);
    courseTurmas.forEach(turma => {
      (turma.disciplines || []).forEach(td => {
        if (td.disciplineId && !existingDiscIds.has(td.disciplineId) && td.status !== 'arquivada') {
          let periodStr = td.periodo || '1º Período';
          if (periodStr.includes('1')) periodStr = '1º Período';
          else if (periodStr.includes('2')) periodStr = '2º Período';
          else if (!periodStr.toLowerCase().includes('período') && !periodStr.toLowerCase().includes('semestre')) {
            periodStr = '1º Período';
          }
          const autoItem = {
            id: `cg_${course.id}_${td.disciplineId}`,
            courseId: course.id,
            period: periodStr,
            disciplineId: td.disciplineId
          };
          courseItems.push(autoItem);
          existingDiscIds.add(td.disciplineId);
          if (!this.state.curriculumGrid.some(g => g.courseId === course.id && g.disciplineId === td.disciplineId)) {
            this.state.curriculumGrid.push(autoItem);
          }
        }
      });
    });

    if (courseItems.length === 0) {
      return `
        <div class="curriculum-flowchart-wrapper" style="margin-bottom: 2rem;">
          <div class="curriculum-flowchart-header">
            <h2 class="curriculum-flowchart-title">MATRIZ CURRICULAR DO CURSO: ${this.escapeHTML(course.name.toUpperCase())}</h2>
            <div class="curriculum-flowchart-subtitle">${this.escapeHTML(activeSchool.nome || '')}</div>
          </div>
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); background: var(--bg-card); border-radius: 8px; border: 1px dashed var(--border-color);">
            <i class="fa-solid fa-graduation-cap" style="font-size: 2rem; opacity: 0.35; margin-bottom: 0.5rem;"></i>
            <p style="margin: 0; font-weight: 600;">Nenhuma disciplina vinculada à matriz do curso <strong>${this.escapeHTML(course.name)}</strong>.</p>
            ${isGestao ? `
              <button class="btn btn-primary btn-sm" style="margin-top: 0.75rem;" onclick="app.openCurriculumModal('${course.id}')">
                <i class="fa-solid fa-plus"></i> Vincular Disciplina à Matriz
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Agrupar por Período
    const getPeriodNum = (p) => {
      const match = String(p || '').match(/\d+/);
      return match ? parseInt(match[0], 10) : 1;
    };

    const grouped = {};
    courseItems.forEach(item => {
      const p = item.period || '1º Período';
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(item);
    });

    const sortedPeriodKeys = Object.keys(grouped).sort((a, b) => getPeriodNum(a) - getPeriodNum(b));

    let totalHoras = 0;
    let totalCHS = 0;

    courseItems.forEach(cg => {
      const disc = this.state.disciplines.find(d => d.id === cg.disciplineId);
      const ch = disc ? (parseInt(disc.workload, 10) || 60) : 60;
      totalHoras += ch;
      totalCHS += Math.round(ch / 15);
    });

    let html = `
      <div class="curriculum-flowchart-wrapper" style="margin-bottom: 2.5rem;">
        <div class="curriculum-flowchart-header">
          <h2 class="curriculum-flowchart-title">MATRIZ CURRICULAR DO CURSO: ${this.escapeHTML(course.name.toUpperCase())}</h2>
          <div class="curriculum-flowchart-subtitle">${this.escapeHTML(activeSchool.nome || '')} • Carga Horária Total: ${totalHoras}h</div>
        </div>

        <div class="curriculum-flowchart-board">
    `;

    sortedPeriodKeys.forEach(periodKey => {
      const list = grouped[periodKey];
      const pNum = getPeriodNum(periodKey);
      const displayPeriod = `${pNum}º PERÍODO`;

      let periodCH = 0;
      let periodCHS = 0;

      list.forEach(cg => {
        const disc = this.state.disciplines.find(d => d.id === cg.disciplineId);
        const ch = disc ? (parseInt(disc.workload, 10) || 60) : 60;
        const chs = Math.round(ch / 15);
        periodCH += ch;
        periodCHS += chs;
      });

      html += `
        <div class="curriculum-period-column">
          <div class="curriculum-period-head">
            <div class="curriculum-period-head-title">${displayPeriod}</div>
            <div class="curriculum-period-head-ch">CH ${periodCH} - CHS ${periodCHS}</div>
            ${isGestao ? `
              <button type="button" class="action-btn-circle" style="position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; font-size: 8px;" onclick="app.openCurriculumModal('${course.id}', '${periodKey}')" title="Adicionar disciplina ao ${displayPeriod}">
                <i class="fa-solid fa-plus"></i>
              </button>
            ` : ''}
          </div>

          <div class="curriculum-period-cards">
            ${list.map((cg, idx) => {
              const disc = this.state.disciplines.find(d => d.id === cg.disciplineId);
              const discName = disc ? disc.name : (cg.name || 'Disciplina');
              const code = disc && disc.code ? disc.code : (cg.code || 'DISC');
              const ch = disc ? (parseInt(disc.workload, 10) || 60) : 60;
              const chs = Math.round(ch / 15);
              const colorClass = this.getAutoCardColorClass(disc, idx);

              return `
                <div class="curriculum-matrix-card ${colorClass}" title="${this.escapeHTML(discName)} (${this.escapeHTML(code)}) • CH: ${ch}h • CHS: ${chs}">
                  ${isGestao ? `
                    <button type="button" class="curriculum-matrix-card-delete" onclick="app.deleteCurriculumItem('${cg.id}')" title="Remover da Matriz">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  ` : ''}
                  <div class="curriculum-matrix-card-code">${this.escapeHTML(code)}</div>
                  <div class="curriculum-matrix-card-name">${this.escapeHTML(discName)}</div>
                  <div class="curriculum-matrix-card-ch">CH ${ch} - CHS ${chs}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    html += `
        </div>

        <div class="curriculum-flowchart-footer">
          <div class="curriculum-flowchart-stats-pills">
            <div class="curriculum-stat-pill">
              <i class="fa-solid fa-book-open"></i>
              <span>${courseItems.length} Disciplinas</span>
            </div>
            <div class="curriculum-stat-pill">
              <i class="fa-solid fa-calendar-days"></i>
              <span>${sortedPeriodKeys.length} Período(s)</span>
            </div>
            <div class="curriculum-stat-pill">
              <i class="fa-solid fa-clock"></i>
              <span>Média de ${Math.round(totalHoras / (sortedPeriodKeys.length || 1))}h por período</span>
            </div>
          </div>

          <div class="curriculum-flowchart-totals">
            <div>CH DISCIPLINAS: ${totalHoras}H</div>
            <div>CHS SEMANAL TOTAL: ${totalCHS} AULAS</div>
            <div class="total-highlight">CARGA HORÁRIA TOTAL: ${totalHoras}H</div>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  renderCurriculumGrid() {
    const courseSelect = document.getElementById('curriculum-filter-curso');
    const container = document.getElementById('curriculum-grid-container');
    if (!container) return;

    if (!this.state.curriculumGrid) this.state.curriculumGrid = [];

    // Sincronizar qualquer disciplina vinculada a turmas dos cursos
    this.syncCourseDisciplinesToCurriculum();

    const activeSchool = this.getActiveSchool();
    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
    const isGestao = this.currentRole === 'gestao' || this.currentRole === 'secretaria';

    // Badge de contexto
    const badgeEl = document.getElementById('curriculum-role-context-badge');
    if (badgeEl) {
      if (this.currentRole === 'professor') {
        badgeEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Matrizes Pedagógicas`;
      } else if (this.currentRole === 'aluno') {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Fluxograma do seu Curso`;
      } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Matriz Pedagógica`;
      }
    }

    if (schoolCourses.length === 0) {
      if (courseSelect) courseSelect.innerHTML = `<option value="">Nenhum curso cadastrado</option>`;
      container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2.5rem;">Nenhum curso cadastrado nesta instituição.</p>`;
      return;
    }

    // Identificar curso do aluno se o papel for 'aluno'
    let studentCourse = null;
    if (this.currentRole === 'aluno') {
      const student = (this.currentUser && this.currentUser.tipo === 'aluno') ? this.currentUser : this.state.users.find(u => u.tipo === 'aluno');
      if (student) {
        if (student.cursoId) {
          studentCourse = schoolCourses.find(c => c.id === student.cursoId);
        }
        if (!studentCourse) {
          const enrolledTurma = this.state.classes.find(t => t.schoolId === activeSchool.id && t.studentIds && t.studentIds.includes(student.id));
          if (enrolledTurma && enrolledTurma.courseId) {
            studentCourse = schoolCourses.find(c => c.id === enrolledTurma.courseId);
          }
        }
      }
      if (studentCourse) {
        this.selectedCurriculumCourseId = studentCourse.id;
      }
    }

    // Preencher select de cursos
    if (courseSelect) {
      if (this.currentRole === 'aluno' && studentCourse) {
        courseSelect.innerHTML = `<option value="${studentCourse.id}">Meu Curso: ${this.escapeHTML(studentCourse.name)} (${this.escapeHTML(studentCourse.code || '')})</option>`;
        courseSelect.value = studentCourse.id;
        courseSelect.disabled = true;
      } else {
        courseSelect.disabled = false;
        let options = `<option value="todos">Todos os Cursos (Visão Geral)</option>`;
        options += schoolCourses.map(c => `<option value="${c.id}">${this.escapeHTML(c.name)} (${this.escapeHTML(c.code || '')})</option>`).join('');
        courseSelect.innerHTML = options;

        if (!this.selectedCurriculumCourseId || (this.selectedCurriculumCourseId !== 'todos' && !schoolCourses.some(c => c.id === this.selectedCurriculumCourseId))) {
          this.selectedCurriculumCourseId = 'todos';
        }
        courseSelect.value = this.selectedCurriculumCourseId;
      }
    }

    const coursesToRender = (this.currentRole === 'aluno' && studentCourse)
      ? [studentCourse]
      : ((!this.selectedCurriculumCourseId || this.selectedCurriculumCourseId === 'todos')
          ? schoolCourses
          : schoolCourses.filter(c => c.id === this.selectedCurriculumCourseId));

    if (coursesToRender.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2.5rem;">Nenhum curso encontrado com o filtro selecionado.</p>`;
      return;
    }

    let fullHTML = '';
    coursesToRender.forEach(course => {
      fullHTML += this.renderCourseFlowchart(course, activeSchool, isGestao);
    });

    container.innerHTML = fullHTML;
    this.updateNavVisibility();
  }

  handleModalCurriculumCourseChange() {
    const courseSelect = document.getElementById('curr-curso');
    const discSelect = document.getElementById('curr-disciplina');
    if (!discSelect || !courseSelect) return;
    const activeSchool = this.getActiveSchool();
    const discs = this.state.disciplines.filter(d => d.schoolId === activeSchool.id);
    discSelect.innerHTML = discs.map(d => `<option value="${d.id}">${d.code ? d.code + ' - ' : ''}${this.escapeHTML(d.name)} (${d.workload || 60}h)</option>`).join('');
  }

  openCurriculumModal(preselectedCourseId = null, preselectedPeriod = null) {
    const courseSelect = document.getElementById('curr-curso');
    const periodSelect = document.getElementById('curr-periodo');
    const activeSchool = this.getActiveSchool();
    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);

    if (courseSelect) {
      courseSelect.innerHTML = schoolCourses.map(c => `<option value="${c.id}">${this.escapeHTML(c.name)} (${this.escapeHTML(c.code || '')})</option>`).join('');
      let targetCourse = preselectedCourseId || (this.selectedCurriculumCourseId !== 'todos' ? this.selectedCurriculumCourseId : schoolCourses[0]?.id);
      if (targetCourse) courseSelect.value = targetCourse;
    }

    if (periodSelect && preselectedPeriod) {
      periodSelect.value = preselectedPeriod;
    }

    this.handleModalCurriculumCourseChange();
    document.getElementById('modal-curriculum').classList.add('open');
  }

  handleSaveCurriculum(e) {
    e.preventDefault();
    const courseId = document.getElementById('curr-curso').value;
    const period = document.getElementById('curr-periodo').value;
    const disciplineId = document.getElementById('curr-disciplina').value;

    if (!this.state.curriculumGrid) this.state.curriculumGrid = [];

    const newCg = {
      id: 'cg_' + Date.now(),
      courseId,
      period,
      disciplineId
    };

    this.state.curriculumGrid.push(newCg);
    this.saveState();
    this.closeModal('modal-curriculum');
    this.showToast('Disciplina vinculada à matriz curricular com sucesso!', 'success');
    this.renderCurriculumGrid();
  }

  async deleteCurriculumItem(id) {
    const confirmed = await this.confirmAction({
      title: 'Remover da Matriz Curricular',
      message: 'Deseja realmente remover esta disciplina da matriz curricular?',
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.curriculumGrid = (this.state.curriculumGrid || []).filter(cg => cg.id !== id);
      this.saveState();
      this.showToast('Disciplina removida da matriz curricular.', 'success');
      this.renderCurriculumGrid();
    }
  }

  /* =========================================================================
     5. OFFICIAL DOCUMENT GENERATOR (Atestado, HistÃ³rico, QuitaÃ§Ã£o) + QR CODE
     ========================================================================= */
  generateDocument(type) { return this.documentModule.generateDocument(type); }
  openVerifyDocumentModal(prefillCode = null) { return this.documentModule.openVerifyDocumentModal(prefillCode); }
  verifyDocumentCode(code) { return this.documentModule.verifyDocumentCode(code); }
  openStudentCardModal(studentId = null) { return this.documentModule.openStudentCardModal(studentId); }
  flipStudentCard() { return this.documentModule.flipStudentCard(); }
  printStudentCard() { return this.pdfService.exportStudentCard(); }
  printStudentCardDirect() { return this.pdfService.printStudentCardDirect(); }
  printDocumentPreview() { return this.pdfService.exportDocumentPreview(); }
  printDocumentDirect() { return this.pdfService.printDocumentDirect(); }
  printGradesPauta(turmaId = null, discId = null) { return this.pdfService.exportGradesPauta(turmaId, discId); }
  printSchedule() { return this.pdfService.exportSchedule(); }
  printCalendar() { return this.pdfService.exportCalendar(); }
  printMatriz() { return this.pdfService.exportMatriz(); }
  printAttendanceReport() { return this.pdfService.exportAttendanceReport(); }
  printFinancialReport() { return this.pdfService.exportFinancialReport(); }
  printTurmaAttendanceSheet(turmaId = null) { return this.pdfService.exportTurmaAttendanceSheet(turmaId); }
  printUsersList(roleFilter = 'todos') { return this.pdfService.exportUsersList(roleFilter); }
  printBibliography() { return this.pdfService.exportBibliography(); }
  exportToPDF(elOrHtml, filename, opt) { return this.pdfService.exportToPDF(elOrHtml, filename, opt); }

  /* --- Central de Notificações & PWA --- */
  toggleNotificationsDropdown(event) {
    if (this.notificationsModule) {
      this.notificationsModule.toggleDropdown(event);
    }
  }

  promptPwaInstall() {
    if (this.deferredPwaPrompt) {
      this.deferredPwaPrompt.prompt();
      this.deferredPwaPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          const btn = document.getElementById('btn-pwa-install');
          if (btn) btn.style.display = 'none';
        }
        this.deferredPwaPrompt = null;
      });
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS || !window.matchMedia('(display-mode: standalone)').matches) {
        document.getElementById('modal-pwa-guide')?.classList.add('open');
      } else {
        this.showToast('O aplicativo já está instalado ou rodando em tela cheia.', 'info');
      }
    }
  }

  /* --- Mural de Avisos & Comunicados --- */
  renderDashboardNotices() { return this.noticeModule.renderDashboardNotices(); }
  openNoticeModal() { return this.noticeModule.openNoticeModal(); }
  handleSaveNotice(e) { return this.noticeModule.handleSaveNotice(e); }
  deleteNotice(id) { return this.noticeModule.deleteNotice(id); }

  /* =========================================================================
     6. PORTAL DO ALUNO (MEU CURSO)
     ========================================================================= */
  renderMeuCurso() { return this.studentModule.renderMeuCurso(); }
  selectStudentDiscipline(discId, section = null) { return this.studentModule.selectStudentDiscipline(discId, section); }
  backToStudentDisciplines() { return this.studentModule.backToStudentDisciplines(); }
  setStudentDiscSection(section) { return this.studentModule.setStudentDiscSection(section); }

  goToStudentDisciplines() { return this.studentModule.goToStudentDisciplines(); }
  openStudentDisciplineFrequency(discId) { return this.studentModule.openStudentDisciplineFrequency(discId); }
  openStudentDisciplineGrades(discId) { return this.studentModule.openStudentDisciplineGrades(discId); }
  goToStudentFrequency() { return this.studentModule.goToStudentFrequency(); }
  goToStudentGrades() { return this.studentModule.goToStudentGrades(); }

  populateSelectDropdowns() {
    const activeSchool = this.getActiveSchool();

    // Populate Courses
    const schoolCourses = this.state.courses.filter(c => c.schoolId === activeSchool.id);
    const courseOptions = schoolCourses.map(c => `<option value="${c.id}">${c.code} - ${c.name}</option>`).join('');

    const userCursoSelect = document.getElementById('user-curso');
    if (userCursoSelect) {
      userCursoSelect.innerHTML = `<option value="">Nenhum curso vinculado (Opcional)</option>` + (courseOptions || '');
    }

    const filterUserCurso = document.getElementById('users-filter-curso');
    if (filterUserCurso) {
      const currentVal = filterUserCurso.value || 'todos';
      filterUserCurso.innerHTML = `<option value="todos">Todos os Cursos</option><option value="sem_curso">Sem curso vinculado</option>` + (courseOptions || '');
      filterUserCurso.value = currentVal;
    }

    const otherCourseSelects = [
      document.getElementById('class-curso'),
      document.getElementById('curr-curso')
    ];
    otherCourseSelects.forEach(sel => {
      if (sel) sel.innerHTML = courseOptions || '<option value="">Sem cursos cadastrados</option>';
    });

    // Populate Disciplines
    const schoolDiscs = this.state.disciplines.filter(d => d.schoolId === activeSchool.id);
    const discOptions = schoolDiscs.map(d => `<option value="${d.id}">${d.code} - ${d.name}</option>`).join('');

    const classDiscSelect = document.getElementById('class-disciplina');
    if (classDiscSelect) {
      classDiscSelect.innerHTML = `<option value="">Nenhuma disciplina vinculada agora (Opcional)</option>` + (discOptions || '');
    }

    const otherDiscSelects = [
      document.getElementById('biblio-disciplina'),
      document.getElementById('curr-disciplina')
    ];
    otherDiscSelects.forEach(sel => {
      if (sel) sel.innerHTML = discOptions || '<option value="">Sem disciplinas cadastradas</option>';
    });

    // Populate Professors
    const profSelect = document.getElementById('class-professor');
    if (profSelect) {
      const profs = this.state.users.filter(u => u.tipo === 'professor' && u.schoolId === activeSchool.id);
      const profOptions = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
      profSelect.innerHTML = `<option value="">Nenhum professor atribuído agora (Opcional)</option>` + (profOptions || '');
    }

    // Populate Turmas & Disciplinas (for frequency and lessons)
    const turmaSelects = [
      document.getElementById('freq-turma-select'),
      document.getElementById('lesson-turma')
    ];
    const schoolTurmas = this.state.classes.filter(t => t.schoolId === activeSchool.id);

    let turmaOptions = '';
    if (schoolTurmas.length === 0) {
      turmaOptions = '<option value="">Sem turmas formadas</option>';
    } else {
      schoolTurmas.forEach(t => {
        this.ensureTurmaDisciplines(t);
        const activeDiscs = (t.disciplines || []).filter(d => d.status !== 'arquivada');
        const archivedDiscs = (t.disciplines || []).filter(d => d.status === 'arquivada');

        if (activeDiscs.length === 0 && archivedDiscs.length === 0) {
          // Turma sem disciplina vinculada
          turmaOptions += `<option value="${t.id}">${this.escapeHTML(t.nome)} (Sem disciplinas)</option>`;
        } else {
          // Disciplinas Ativas (Em Andamento)
          activeDiscs.forEach(td => {
            const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
            const discName = disc ? disc.name : 'Disciplina';
            const periodStr = td.periodo ? ` [${td.periodo}]` : '';
            const isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
            const sharedStr = isShared ? ' (Aula Conjunta)' : '';
            turmaOptions += `<option value="${t.id}__${td.id}">${this.escapeHTML(t.nome)} • ${this.escapeHTML(discName)}${periodStr}${sharedStr}</option>`;
          });

          // Disciplinas Arquivadas (Histórico)
          archivedDiscs.forEach(td => {
            const disc = this.state.disciplines.find(d => d.id === td.disciplineId);
            const discName = disc ? disc.name : 'Disciplina';
            const periodStr = td.periodo ? ` [${td.periodo}]` : '';
            turmaOptions += `<option value="${t.id}__${td.id}" style="color:var(--text-muted);">${this.escapeHTML(t.nome)} • ${this.escapeHTML(discName)}${periodStr} (Arquivada)</option>`;
          });
        }
      });
    }

    turmaSelects.forEach(sel => {
      if (sel) {
        const currentVal = sel.value;
        sel.innerHTML = turmaOptions;
        if (currentVal && Array.from(sel.options).some(opt => opt.value === currentVal)) {
          sel.value = currentVal;
        }
      }
    });

    // Populate Alunos for Financial
    const finAlunoSelect = document.getElementById('fin-aluno');
    if (finAlunoSelect) {
      const alunos = this.state.users.filter(u => u.tipo === 'aluno' && u.schoolId === activeSchool.id);
      finAlunoSelect.innerHTML = alunos.map(a => `<option value="${a.id}">${a.nome} (${a.ra})</option>`).join('') || '<option value="">Sem alunos cadastrados</option>';
    }
  }

  /* =========================================================================
     7. FIREBASE INTEGRATION & MODAL CONTROLS
     ========================================================================= */
  async syncWithFirebase(showNotification = false) {
    if (!this.isFirebaseActive || !this.db) {
      if (showNotification) {
        this.showToast('Firebase não está ativo. Verifique se o arquivo firebase-config.js contém suas chaves corretas.', 'warning');
      }
      return false;
    }

    const activeSchool = this.getActiveSchool();
    if (!activeSchool) {
      if (showNotification) this.showToast('Nenhuma instituição ativa selecionada para sincronizar.', 'warning');
      return false;
    }

    if (showNotification) {
      return await this.firebaseService.syncSchoolData(activeSchool, this.state, { showNotification: true });
    } else {
      this.firebaseService.scheduleSync(activeSchool, this.state);
      return true;
    }
  }

  async fetchSchoolDataFromFirestore(schoolId) {
    if (!this.isFirebaseActive || !this.db || !schoolId) return;
    try {
      const updated = await this.firebaseService.fetchSchoolData(schoolId, this.state);
      if (updated) {
        this.saveStateLocally();
      }
    } catch (e) {
      console.warn('Erro ao carregar dados da instituição do Firestore:', e);
    }
  }

  async testFirebaseConnection() {
    return await this.syncWithFirebase(true);
  }

  /* --- UI Helpers --- */
  toggleSidebar() {
    const isMobile = window.innerWidth <= 1024;
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (isMobile) {
      if (sidebar) sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  }

  toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('portal_theme', newTheme);

    const icon = document.getElementById('theme-icon');
    const authIcon = document.getElementById('auth-theme-icon');
    const iconClass = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    if (icon) icon.className = iconClass;
    if (authIcon) authIcon.className = iconClass;
  }

  applyThemeFromStorage() {
    const savedTheme = localStorage.getItem('portal_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    const authIcon = document.getElementById('auth-theme-icon');
    const iconClass = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (icon) icon.className = iconClass;
    if (authIcon) authIcon.className = iconClass;
  }

  async closeModal(modalId, force = false) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    if (!force) {
      const dirtyForm = modal.querySelector('form[data-dirty="true"]');
      if (dirtyForm) {
        const confirmDiscard = await this.confirmAction({
          title: 'Descartar Alterações?',
          message: 'Você possui alterações não salvas neste formulário. Se fechar agora, os dados digitados serão perdidos. Deseja realmente descartar?',
          confirmText: 'Sim, Descartar',
          cancelText: 'Continuar Editando',
          type: 'warning'
        });
        if (!confirmDiscard) return false;
        dirtyForm.dataset.dirty = 'false';
      }
    } else {
      const forms = modal.querySelectorAll('form');
      forms.forEach(f => { f.dataset.dirty = 'false'; });
    }

    modal.classList.remove('open');
    return true;
  }

  /* =========================================================================
     COMMAND PALETTE (CTRL + K) & GLOBAL QUICK SEARCH
     ========================================================================= */
  openCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    const input = document.getElementById('command-palette-input');
    if (!modal) return;

    modal.classList.add('open');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 60);
    }
    this.renderCommandPaletteResults('');
    this.setupCommandPaletteEvents();
  }

  closeCommandPalette() {
    const modal = document.getElementById('modal-command-palette');
    if (modal) modal.classList.remove('open');
  }

  setupCommandPaletteEvents() {
    const input = document.getElementById('command-palette-input');
    if (!input || input._cmdInit) return;
    input._cmdInit = true;

    input.addEventListener('input', (e) => {
      this.renderCommandPaletteResults(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
      const items = Array.from(document.querySelectorAll('#command-palette-results .cmd-result-item'));
      if (items.length === 0) return;

      let selectedIndex = items.findIndex(el => el.classList.contains('selected'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
        this.selectCommandPaletteIndex(nextIndex, items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
        this.selectCommandPaletteIndex(prevIndex, items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const active = items[selectedIndex >= 0 ? selectedIndex : 0];
        if (active) active.click();
      }
    });
  }

  selectCommandPaletteIndex(index, items) {
    items.forEach((it, idx) => {
      if (idx === index) {
        it.classList.add('selected');
        it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        it.classList.remove('selected');
      }
    });
  }

  renderCommandPaletteResults(query = '') {
    const container = document.getElementById('command-palette-results');
    if (!container) return;

    const q = (query || '').trim().toLowerCase();
    const activeSchool = this.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    // Catálogo de Menus & Rotas do Portal
    const navigationCatalog = [
      { id: 'nav-dashboard', title: 'Visão Geral / Dashboard', subtitle: 'Métricas gerais e indicadores do portal', icon: 'fa-chart-pie', tab: 'tab-dashboard' },
      { id: 'nav-calendario', title: 'Calendário Acadêmico', subtitle: 'Marcos, provas, feriados e reuniões', icon: 'fa-calendar-days', tab: 'tab-calendario' },
      { id: 'nav-usuarios', title: 'Usuários & RAs', subtitle: 'Cadastro de estudantes, professores e secretaria', icon: 'fa-users', tab: 'tab-usuarios', roles: ['gestao', 'secretaria'] },
      { id: 'nav-turmas', title: 'Turmas & Vínculos', subtitle: 'Enturmações, períodos e disciplinas', icon: 'fa-layer-group', tab: 'tab-turmas', roles: ['gestao', 'professor'] },
      { id: 'nav-aulas', title: 'Diário & Aulas', subtitle: 'Registro de aulas, presença e chamada ágil', icon: 'fa-chalkboard-user', tab: 'tab-aulas', roles: ['gestao', 'professor'] },
      { id: 'nav-notas', title: 'Notas & Avaliações', subtitle: 'Lançamento de notas e cálculo de médias', icon: 'fa-award', tab: 'tab-notas', roles: ['gestao', 'secretaria', 'professor'] },
      { id: 'nav-financeiro', title: 'Financeiro & Mensalidades', subtitle: 'Controle de mensalidades, PIX e bolsas', icon: 'fa-file-invoice-dollar', tab: 'tab-financeiro' },
      { id: 'nav-documentos', title: 'Histórico & Documentos Oficiais', subtitle: 'Emissão de atestados, históricos e carteirinha', icon: 'fa-file-signature', tab: 'tab-documentos', roles: ['aluno', 'secretaria', 'gestao'] },
      { id: 'nav-horarios', title: 'Quadro de Horários', subtitle: 'Grade semanal de aulas por turma e docente', icon: 'fa-clock', tab: 'tab-horarios' },
      { id: 'nav-matriz', title: 'Matriz Curricular', subtitle: 'Estrutura curricular e carga horária dos cursos', icon: 'fa-diagram-project', tab: 'tab-matriz' },
      { id: 'nav-escolas', title: 'Minha Instituição', subtitle: 'Configurações de CNPJ, logo, critérios e PIX', icon: 'fa-building-columns', tab: 'tab-escolas', roles: ['gestao'] },
      { id: 'nav-bibliografia', title: 'Bibliografia & Acervo', subtitle: 'Livros didáticos e referências do curso', icon: 'fa-lines-leaning', tab: 'tab-bibliografia' }
    ];

    const quickActions = [
      { id: 'act-new-lesson', title: 'Cadastrar Nova Aula no Diário', subtitle: 'Lançar data, conteúdo e chamada', icon: 'fa-plus-circle', roles: ['gestao', 'professor'] },
      { id: 'act-new-user', title: 'Matricular Novo Estudante / Usuário', subtitle: 'Gera RA automático para a instituição', icon: 'fa-user-plus', roles: ['gestao', 'secretaria'] },
      { id: 'act-change-password', title: 'Alterar Minha Senha de Acesso', subtitle: 'Trocar senha atual por uma nova com confirmação', icon: 'fa-key' },
      { id: 'act-toggle-theme', title: 'Alternar Tema Claro / Escuro', subtitle: 'Mudar a paleta de cores da interface', icon: 'fa-moon' },
      { id: 'act-switch-school', title: 'Trocar Instituição Ativa', subtitle: 'Alternar polo ou filial conectada', icon: 'fa-arrows-rotate' }
    ];

    const students = (this.state.users || []).filter(u => u.tipo === 'aluno' && (!schoolId || u.schoolId === schoolId));
    const turmas = (this.state.classes || []).filter(t => !schoolId || t.schoolId === schoolId);

    const matchesNav = navigationCatalog.filter(item => {
      if (item.roles && !item.roles.includes(this.currentRole)) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
    });

    const matchesActions = quickActions.filter(item => {
      if (item.roles && !item.roles.includes(this.currentRole)) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
    });

    let matchesStudents = [];
    if (q.length >= 2) {
      matchesStudents = students.filter(s => {
        const nome = (s.nome || '').toLowerCase();
        const ra = (s.ra || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const cpf = (s.cpf || '').toLowerCase();
        return nome.includes(q) || ra.includes(q) || email.includes(q) || cpf.includes(q);
      }).slice(0, 6);
    }

    let matchesTurmas = [];
    if (q.length >= 2) {
      matchesTurmas = turmas.filter(t => {
        const nome = (t.nome || '').toLowerCase();
        const code = (t.code || '').toLowerCase();
        return nome.includes(q) || code.includes(q);
      }).slice(0, 4);
    }

    if (matchesNav.length === 0 && matchesActions.length === 0 && matchesStudents.length === 0 && matchesTurmas.length === 0) {
      container.innerHTML = `
        <div class="cmd-empty-state">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: var(--text-muted); opacity: 0.5; margin-bottom: 8px; display: block;"></i>
          Nenhum resultado encontrado para "<strong>${this.escapeHTML(query)}</strong>".
        </div>
      `;
      return;
    }

    let html = '';

    // Seção de Alunos
    if (matchesStudents.length > 0) {
      html += `<div class="cmd-group-title"><i class="fa-solid fa-user-graduate"></i> Estudantes Encontrados</div>`;
      matchesStudents.forEach(st => {
        html += `
          <div class="cmd-result-item" onclick="app.executeCommandStudent('${st.id}')">
            <div class="cmd-item-icon"><i class="fa-solid fa-user"></i></div>
            <div class="cmd-item-content">
              <div class="cmd-item-title">${this.escapeHTML(st.nome)}</div>
              <div class="cmd-item-subtitle">RA: ${this.escapeHTML(st.ra || '-')} • ${this.escapeHTML(st.email || '')}</div>
            </div>
            <span class="cmd-item-badge">Boletim / Ficha</span>
          </div>
        `;
      });
    }

    // Seção de Turmas
    if (matchesTurmas.length > 0) {
      html += `<div class="cmd-group-title"><i class="fa-solid fa-layer-group"></i> Turmas</div>`;
      matchesTurmas.forEach(tm => {
        html += `
          <div class="cmd-result-item" onclick="app.executeCommandTurma('${tm.id}')">
            <div class="cmd-item-icon"><i class="fa-solid fa-graduation-cap"></i></div>
            <div class="cmd-item-content">
              <div class="cmd-item-title">${this.escapeHTML(tm.nome)}</div>
              <div class="cmd-item-subtitle">${this.escapeHTML(tm.periodo || 'Turma Ativa')}</div>
            </div>
            <span class="cmd-item-badge">Abrir Diário</span>
          </div>
        `;
      });
    }

    // Seção de Menus
    if (matchesNav.length > 0) {
      html += `<div class="cmd-group-title"><i class="fa-solid fa-compass"></i> Telas & Menus</div>`;
      matchesNav.forEach(m => {
        html += `
          <div class="cmd-result-item" onclick="app.switchTab('${m.tab}'); app.closeCommandPalette();">
            <div class="cmd-item-icon"><i class="fa-solid ${m.icon}"></i></div>
            <div class="cmd-item-content">
              <div class="cmd-item-title">${this.escapeHTML(m.title)}</div>
              <div class="cmd-item-subtitle">${this.escapeHTML(m.subtitle)}</div>
            </div>
            <span class="cmd-item-badge">Ir para tela</span>
          </div>
        `;
      });
    }

    // Seção de Ações Rápidas
    if (matchesActions.length > 0) {
      html += `<div class="cmd-group-title"><i class="fa-solid fa-bolt"></i> Ações Rápidas</div>`;
      matchesActions.forEach((act) => {
        html += `
          <div class="cmd-result-item" onclick="app.executeQuickAction('${act.id}')">
            <div class="cmd-item-icon"><i class="fa-solid ${act.icon}"></i></div>
            <div class="cmd-item-content">
              <div class="cmd-item-title">${this.escapeHTML(act.title)}</div>
              <div class="cmd-item-subtitle">${this.escapeHTML(act.subtitle)}</div>
            </div>
            <span class="cmd-item-badge">Executar</span>
          </div>
        `;
      });
    }

    container.innerHTML = html;

    const firstItem = container.querySelector('.cmd-result-item');
    if (firstItem) firstItem.classList.add('selected');
  }

  executeCommandStudent(studentId) {
    this.closeCommandPalette();
    const student = (this.state.users || []).find(u => u.id === studentId);
    if (!student) return;

    if (this.currentRole === 'aluno') {
      this.switchTab('tab-meu-curso');
    } else {
      this.academicReportsModule.generateBoletim(student.id);
    }
  }

  executeCommandTurma(turmaId) {
    this.closeCommandPalette();
    if (this.currentRole === 'professor' || this.currentRole === 'gestao') {
      this.selectedLessonTurmaId = turmaId;
      this.switchTab('tab-aulas');
    } else {
      this.switchTab('tab-turmas');
    }
  }

  executeQuickAction(actionId) {
    this.closeCommandPalette();
    if (actionId === 'act-new-lesson') {
      this.switchTab('tab-aulas');
      setTimeout(() => this.lessonModule.openAddLessonModal(), 200);
    } else if (actionId === 'act-new-user') {
      this.switchTab('tab-usuarios');
      setTimeout(() => this.openAddUserModal(), 200);
    } else if (actionId === 'act-toggle-theme') {
      this.toggleTheme();
    } else if (actionId === 'act-change-password') {
      this.openChangePasswordModal();
    } else if (actionId === 'act-switch-school') {
      this.openSchoolModal();
    }
  }

  /* =========================================================================
     SIDEBAR ACCORDION CONTROLLER
     ========================================================================= */
  toggleSidebarSection(headerEl) {
    if (!headerEl) return;
    const group = headerEl.closest('.nav-section-group');
    if (!group) return;

    const sectionId = headerEl.dataset.sectionId || 'default';
    const isCollapsed = group.classList.toggle('collapsed');

    try {
      const saved = JSON.parse(localStorage.getItem('portal_sidebar_collapsed') || '{}');
      saved[sectionId] = isCollapsed;
      localStorage.setItem('portal_sidebar_collapsed', JSON.stringify(saved));
    } catch (e) {}
  }

  restoreSidebarSections() {
    try {
      const saved = JSON.parse(localStorage.getItem('portal_sidebar_collapsed') || '{}');
      Object.keys(saved).forEach(secId => {
        if (saved[secId]) {
          const header = document.querySelector(`.nav-section-title[data-section-id="${secId}"]`);
          const group = header ? header.closest('.nav-section-group') : null;
          if (group) group.classList.add('collapsed');
        }
      });
    } catch (e) {}
  }

  openSchoolModal() {
    this.openSwitchSchoolModal();
  }

  openSwitchSchoolModal() {
    const listContainer = document.getElementById('switch-school-list');
    if (!listContainer) return;

    const userEmail = this.currentUser ? this.currentUser.email.toLowerCase() : '';
    const userAccounts = this.state.users.filter(u => u.email && u.email.toLowerCase() === userEmail);
    const userSchools = userAccounts.map(acc => {
      const sch = this.state.schools.find(s => s.id === acc.schoolId);
      return sch ? { school: sch, user: acc } : null;
    }).filter(Boolean);

    const titleEl = document.getElementById('modal-switch-school-title');
    const descEl = document.getElementById('modal-switch-school-desc');

    if (userSchools.length <= 1) {
      const current = this.getActiveSchool();
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-building-columns"></i> Sua Instituição';
      if (descEl) descEl.textContent = 'Instituição ativa no momento associada à sua conta:';
      listContainer.innerHTML = `
        <div class="callout-tip" style="margin-bottom: 1rem;">
          <i class="fa-solid fa-circle-info"></i>
          <div>Seu e-mail está associado à <strong>${this.escapeHTML(current ? current.nome : 'Instituição Ativa')}</strong>. Caso queira registrar uma nova instituição com este mesmo e-mail, utilize a opção <em>Cadastrar Nova Escola</em> na tela inicial de login.</div>
        </div>
        <div class="switch-school-card active">
          <div>
            <div style="font-weight: 700; font-size: 1rem;">${this.escapeHTML(current ? current.nome : 'Instituição')}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 3px;">
              ${this.escapeHTML((current && current.cidade) || '')} • Perfil: <strong>${this.currentUser ? this.currentUser.tipo.toUpperCase() : 'GESTAO'}</strong>
            </div>
          </div>
          <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Em Uso (Ativa)</span>
        </div>
      `;
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-building-columns"></i> Alternar Instituição';
      if (descEl) descEl.textContent = 'Identificamos que seu e-mail possui acesso a mais de uma instituição. Escolha qual deseja visualizar:';
      listContainer.innerHTML = userSchools.map(item => {
        const isActive = item.school.id === this.state.activeSchoolId;
        return `
          <div class="switch-school-card ${isActive ? 'active' : ''}" onclick="app.switchActiveAccount('${item.user.id}')">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${this.escapeHTML(item.school.nome)}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 3px;">
                ${this.escapeHTML(item.school.cidade || 'Brasil')} • Perfil: <strong>${item.user.tipo.toUpperCase()}</strong>
              </div>
            </div>
            <div>
              ${isActive 
                ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Ativa</span>`
                : `<button type="button" class="btn btn-primary btn-sm"><i class="fa-solid fa-repeat"></i> Visualizar</button>`
              }
            </div>
          </div>
        `;
      }).join('');
    }

    document.getElementById('modal-switch-school').classList.add('open');
  }

  switchActiveAccount(userId) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return;

    const school = this.state.schools.find(s => s.id === user.schoolId);
    if (!school) return;

    this.currentUser = user;
    this.state.activeSchoolId = school.id;
    this.currentRole = user.tipo;
    localStorage.setItem('portal_current_user', JSON.stringify(user));
    this.saveState();

    this.closeModal('modal-switch-school');
    this.showToast(`Ambiente alterado para a instituição: "${school.nome}".`, 'info', 'Instituição Selecionada');
    this.setRole(user.tipo);
    this.switchTab('tab-dashboard');
    this.render();
  }

  /* =========================================================================
     8. AUTHENTICATION & FULL-SCREEN SAAS GATEWAY CONTROLS
     ========================================================================= */
  checkAuthStatus() {
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');

    if (!this.currentUser || !this.isLoggedIn) {
      if (authView) authView.style.display = 'flex';
      if (appView) appView.style.display = 'none';
      document.documentElement.setAttribute('data-theme', 'light');
      this.switchAuthMode('login');
    } else {
      if (authView) authView.style.display = 'none';
      if (appView) appView.style.display = 'flex';
      this.applyThemeFromStorage();
      this.updateSidebarUserInfo();
    }
  }

  updateSidebarUserInfo() {
    if (!this.currentUser) return;
    const nameEl = document.getElementById('sidebar-user-name');
    const badgeEl = document.getElementById('sidebar-user-role-badge');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = this.currentUser.nome || 'Usuário Logado';
    if (badgeEl) {
      badgeEl.textContent = (this.currentUser.tipo || 'gestao').toUpperCase();
      badgeEl.className = `user-role-badge role-${this.currentUser.tipo || 'gestao'}`;
    }
    if (avatarEl) {
      const parts = (this.currentUser.nome || 'U L').split(' ');
      const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }
  }

  findUsersByIdentifier(identifier) {
    if (!identifier) return [];
    const clean = identifier.trim().toLowerCase();
    if (!this.state.users) return [];
    return this.state.users.filter(u => 
      (u.email && u.email.trim().toLowerCase() === clean) || 
      (u.ra && u.ra.trim().toLowerCase() === clean)
    );
  }

  findUserByIdentifier(identifier) {
    const users = this.findUsersByIdentifier(identifier);
    return users.length > 0 ? users[0] : null;
  }

  switchAuthMode(mode) {
    const formLogin = document.getElementById('form-login-pane');
    const formEscola = document.getElementById('form-cadastrar-escola-pane');

    if (mode === 'login' || mode === 'form-login') {
      if (formLogin) formLogin.style.display = 'block';
      if (formEscola) formEscola.style.display = 'none';
      const idInput = document.getElementById('login-identifier');
      if (idInput) setTimeout(() => idInput.focus(), 60);
    } else {
      // mode === 'escola'
      if (formLogin) formLogin.style.display = 'none';
      if (formEscola) formEscola.style.display = 'block';
      const nameInput = document.getElementById('new-school-name');
      if (nameInput) setTimeout(() => nameInput.focus(), 60);
    }
  }

  async handleGoogleLogin() {
    if (this.isFirebaseActive && this.firebaseApp && this.auth) {
      try {
        const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(this.auth, provider);
        const user = result.user;
        if (user && user.email) {
          let matching = this.findUsersByIdentifier(user.email);
          if (matching.length > 0) {
            this.handleUserLoginSuccess(matching[0]);
          } else {
            this.showToast(`Login Google autorizado (${user.email}), mas o e-mail não possui cadastro no Portal desta escola.`, 'warning', 6000);
          }
        }
      } catch (err) {
        console.warn('Google login feedback:', err);
        if (err.code === 'auth/popup-closed-by-user') return;
        this.showToast('Para login direto com o Google, certifique-se de ativar o provedor Google no Console do Firebase. Você pode entrar com seu E-mail/RA e Senha.', 'info', 6000);
      }
    } else {
      this.showToast('Para login com o Google, ative o provedor Google no Console do Firebase ou utilize E-mail/RA e Senha.', 'info', 5000);
    }
  }

  handleForgotPassword() {
    const identifier = prompt('Informe seu e-mail ou RA cadastrado para instruções de recuperação:');
    if (identifier && identifier.trim()) {
      const users = this.findUsersByIdentifier(identifier.trim());
      if (users.length > 0) {
        this.showToast(`Instruções de acesso preparadas para ${users[0].nome}. Contate a Secretaria ou Gestão para redefinir sua senha com segurança.`, 'info', 5000);
      } else {
        this.showToast('Se o e-mail ou RA estiver cadastrado, a equipe acadêmica processará a recuperação.', 'info', 4000);
      }
    }
  }

  togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    const icon = btn ? btn.querySelector('i') : null;
    if (icon) {
      icon.className = isPass ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    }
  }

  openChangePasswordModal() {
    const modal = document.getElementById('modal-change-password');
    if (!modal) return;

    const form = modal.querySelector('form');
    if (form) {
      form.reset();
      form.dataset.dirty = 'false';
    }

    // Redefinir tipos de campo para senha (oculto)
    ['change-pass-current', 'change-pass-new', 'change-pass-confirm'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.type = 'password';
      const btn = input ? input.parentElement.querySelector('.btn-toggle-pass') : null;
      if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fa-regular fa-eye';
      }
    });

    modal.classList.add('open');
    const firstInput = document.getElementById('change-pass-current');
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
  }

  async handleChangePasswordSubmit(e) {
    e.preventDefault();
    if (!this.currentUser) {
      this.showToast('Nenhum usuário autenticado no momento.', 'warning');
      return;
    }

    const currentPassInput = document.getElementById('change-pass-current');
    const newPassInput = document.getElementById('change-pass-new');
    const confirmPassInput = document.getElementById('change-pass-confirm');

    const currentPass = currentPassInput ? currentPassInput.value : '';
    const newPass = newPassInput ? newPassInput.value : '';
    const confirmPass = confirmPassInput ? confirmPassInput.value : '';

    const expectedCurrentPass = this.currentUser.password || '123456';

    if (!currentPass) {
      this.showToast('Por favor, informe sua senha atual.', 'warning');
      if (currentPassInput) currentPassInput.focus();
      return;
    }

    if (currentPass !== expectedCurrentPass) {
      this.showToast('A senha atual digitada está incorreta.', 'error', 'Senha Incorreta');
      if (currentPassInput) {
        currentPassInput.focus();
        currentPassInput.select();
      }
      return;
    }

    if (!newPass || newPass.length < 6) {
      this.showToast('A nova senha deve possuir no mínimo 6 caracteres.', 'warning', 'Senha Muito Curta');
      if (newPassInput) newPassInput.focus();
      return;
    }

    if (newPass === currentPass) {
      this.showToast('A nova senha deve ser diferente da sua senha atual.', 'warning', 'Mesma Senha');
      if (newPassInput) newPassInput.focus();
      return;
    }

    if (newPass !== confirmPass) {
      this.showToast('A confirmação não confere com a nova senha digitada.', 'warning', 'Senhas Diferentes');
      if (confirmPassInput) {
        confirmPassInput.focus();
        confirmPassInput.select();
      }
      return;
    }

    // 1. Atualizar credencial do usuário em sessão
    const updatedTimestamp = new Date().toISOString();
    this.currentUser.password = newPass;
    this.currentUser.atualizadoEm = updatedTimestamp;

    // 2. Atualizar no array local de usuários
    if (this.state.users && Array.isArray(this.state.users)) {
      const userInList = this.state.users.find(u => u.id === this.currentUser.id);
      if (userInList) {
        userInList.password = newPass;
        userInList.atualizadoEm = updatedTimestamp;
      }
    }

    // 3. Persistir no localStorage
    localStorage.setItem('portal_current_user', JSON.stringify(this.currentUser));
    this.saveState();

    // 4. Sincronizar no Firestore se habilitado
    if (this.isFirebaseActive && this.db && this.currentUser.id) {
      try {
        setDoc(doc(this.db, 'usuarios', this.currentUser.id), {
          password: newPass,
          atualizadoEm: updatedTimestamp
        }, { merge: true }).catch(err => console.warn('Aviso Firestore ao persistir nova senha:', err));
      } catch (err) {}
    }

    const form = e.target;
    if (form) {
      form.dataset.dirty = 'false';
      form.reset();
    }

    this.closeModal('modal-change-password', true);
    this.showToast('Sua senha foi alterada com sucesso!', 'success', 'Senha Atualizada');
  }

  async fetchSchoolDataFromFirestore(schoolId) {
    if (!this.isFirebaseActive || !this.db || !schoolId) return;
    try {
      // 1. Busca o estado consolidado da escola na coleção 'portal_data'
      const pDoc = await getDoc(doc(this.db, 'portal_data', schoolId));
      if (pDoc.exists()) {
        const data = pDoc.data();
        if (data.schools && Array.isArray(data.schools)) {
          if (!this.state.schools) this.state.schools = [];
          data.schools.forEach(s => {
            if (!this.state.schools.some(ex => ex.id === s.id)) this.state.schools.push(s);
          });
        }
        if (data.courses && Array.isArray(data.courses)) {
          if (!this.state.courses) this.state.courses = [];
          data.courses.forEach(c => {
            if (!this.state.courses.some(ex => ex.id === c.id)) this.state.courses.push(c);
          });
        }
        if (data.disciplines && Array.isArray(data.disciplines)) {
          if (!this.state.disciplines) this.state.disciplines = [];
          data.disciplines.forEach(d => {
            if (!this.state.disciplines.some(ex => ex.id === d.id)) this.state.disciplines.push(d);
          });
        }
        if (data.classes && Array.isArray(data.classes)) {
          if (!this.state.classes) this.state.classes = [];
          data.classes.forEach(cl => {
            if (!this.state.classes.some(ex => ex.id === cl.id)) this.state.classes.push(cl);
          });
        }
        if (data.users && Array.isArray(data.users)) {
          if (!this.state.users) this.state.users = [];
          data.users.forEach(u => {
            const idx = this.state.users.findIndex(ex => ex.id === u.id);
            if (idx >= 0) this.state.users[idx] = u;
            else this.state.users.push(u);
          });
        }
        this.saveStateLocally();
      } else {
        // Tenta na coleção 'escolas'
        const eDoc = await getDoc(doc(this.db, 'escolas', schoolId));
        if (eDoc.exists()) {
          const sch = eDoc.data();
          if (!this.state.schools) this.state.schools = [];
          if (!this.state.schools.some(ex => ex.id === sch.id)) this.state.schools.push(sch);
          this.saveStateLocally();
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar dados da instituição do Firestore:', e);
    }
  }

  saveStateLocally() {
    try {
      localStorage.setItem('portal_do_curso_data', JSON.stringify(this.state));
    } catch (e) {}
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const identifierInput = document.getElementById('login-identifier');
    const passwordInput = document.getElementById('login-password');
    const identifier = identifierInput ? identifierInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!identifier) {
      this.showToast('Por favor, informe seu e-mail ou RA de cadastro.', 'warning');
      return;
    }

    if (!password) {
      this.showToast('Por favor, informe sua senha de acesso.', 'warning');
      return;
    }

    // 1. Busca primeiro no estado local (offline-first / cache do navegador)
    let matchingUsers = this.findUsersByIdentifier(identifier);

    // 2. Se não encontrar no navegador (ex: aluno acessando de outro computador/celular), consulta o Firestore
    if (matchingUsers.length === 0 && this.isFirebaseActive && this.db) {
      try {
        // Busca na coleção 'usuarios' por e-mail
        const qEmail = query(collection(this.db, 'usuarios'), where('email', '==', identifier));
        let snap = await getDocs(qEmail);

        // Se não encontrou por e-mail, busca por RA
        if (snap.empty) {
          const qRa = query(collection(this.db, 'usuarios'), where('ra', '==', identifier));
          snap = await getDocs(qRa);
        }

        if (!snap.empty) {
          if (!this.state.users) this.state.users = [];
          for (const docSnap of snap.docs) {
            const remoteUser = docSnap.data();
            const existingIdx = this.state.users.findIndex(u => u.id === remoteUser.id);
            if (existingIdx >= 0) {
              this.state.users[existingIdx] = remoteUser;
            } else {
              this.state.users.push(remoteUser);
            }

            // Carrega os dados da escola vinculada do Firestore
            if (remoteUser.schoolId) {
              await this.fetchSchoolDataFromFirestore(remoteUser.schoolId);
            }
          }
          matchingUsers = this.findUsersByIdentifier(identifier);
        }
      } catch (err) {
        console.warn('Consulta ao Firestore durante o login:', err);
      }
    }

    // Validação de credenciais: verificar se a senha confere
    const validUsers = matchingUsers.filter(u => !u.password || u.password === password);

    if (validUsers.length === 0) {
      this.showToast('E-mail/RA ou senha incorretos. Por favor, verifique suas credenciais.', 'error', 'Falha no Acesso');
      return;
    }

    // Se o usuário possuir mais de uma instituição cadastrada com este mesmo e-mail (Multi-Escola)
    if (validUsers.length > 1) {
      this.promptSchoolSelectionForLogin(validUsers);
      return;
    }

    // Apenas 1 instituição vinculada
    const user = validUsers[0];
    const school = this.state.schools ? this.state.schools.find(s => s.id === user.schoolId) : null;
    if (school) {
      this.state.activeSchoolId = school.id;
    }

    this.currentUser = user;
    this.currentRole = user.tipo;
    this.isLoggedIn = true;
    localStorage.setItem('portal_current_user', JSON.stringify(user));
    localStorage.removeItem('portal_active_tab');
    this.saveState();

    if (identifierInput) identifierInput.value = '';
    if (passwordInput) passwordInput.value = '';

    this.checkAuthStatus();
    this.setRole(user.tipo);
    this.switchTab('tab-dashboard');
    this.render();
  }

  promptSchoolSelectionForLogin(validUsers) {
    const listContainer = document.getElementById('switch-school-list');
    const titleEl = document.getElementById('modal-switch-school-title');
    const descEl = document.getElementById('modal-switch-school-desc');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-building-columns"></i> Selecione a Instituição para Acessar';
    if (descEl) descEl.innerHTML = 'Identificamos que seu e-mail possui acesso a mais de uma instituição. <strong>Clique na instituição que deseja visualizar:</strong>';

    const userSchools = validUsers.map(user => {
      const sch = this.state.schools.find(s => s.id === user.schoolId);
      return sch ? { school: sch, user } : null;
    }).filter(Boolean);

    listContainer.innerHTML = userSchools.map(item => {
      return `
        <div class="switch-school-card" onclick="app.selectSchoolAndLogin('${item.user.id}')">
          <div>
            <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">${this.escapeHTML(item.school.nome)}</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">
              <i class="fa-solid fa-location-dot"></i> ${this.escapeHTML(item.school.cidade || 'Brasil')} • Perfil: <strong>${item.user.tipo.toUpperCase()}</strong>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-right-to-bracket"></i> Acessar
          </button>
        </div>
      `;
    }).join('');

    document.getElementById('modal-switch-school').classList.add('open');
  }

  selectSchoolAndLogin(userId) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return;

    const school = this.state.schools.find(s => s.id === user.schoolId);
    if (school) {
      this.state.activeSchoolId = school.id;
    }

    this.currentUser = user;
    this.currentRole = user.tipo;
    this.isLoggedIn = true;
    localStorage.setItem('portal_current_user', JSON.stringify(user));
    localStorage.removeItem('portal_active_tab');
    this.saveState();

    const identifierInput = document.getElementById('login-identifier');
    const passwordInput = document.getElementById('login-password');
    if (identifierInput) identifierInput.value = '';
    if (passwordInput) passwordInput.value = '';

    this.closeModal('modal-switch-school');
    this.checkAuthStatus();
    this.setRole(user.tipo);
    this.switchTab('tab-dashboard');
    this.render();
  }

  handleRegisterSchoolSubmit(e) {
    e.preventDefault();
    const schoolName = document.getElementById('new-school-name').value.trim();
    const directorName = document.getElementById('new-school-director').value.trim();
    const schoolEmail = document.getElementById('new-school-email').value.trim();
    const password = document.getElementById('new-school-password').value;
    const cnpj = document.getElementById('new-school-cnpj').value.trim();
    const phone = document.getElementById('new-school-phone').value.trim();
    const city = document.getElementById('new-school-city').value.trim();
    const address = document.getElementById('new-school-address').value.trim();

    if (!schoolName || !schoolEmail) {
      this.showToast('Por favor, informe ao menos o Nome da Instituição e o E-mail de Contato.', 'warning', 'Campos Obrigatórios');
      return;
    }

    // 1. Criar a nova escola com ID único exclusivo
    const schoolId = this.generateUniqueId('sch');
    const newSchool = {
      id: schoolId,
      nome: schoolName,
      diretor: directorName || 'Diretor Responsável',
      email: schoolEmail,
      cnpj: cnpj || 'Não informado',
      telefone: phone || 'Não informado',
      cidade: city || 'Não informada',
      endereco: address || 'Endereço não informado',
      criadoEm: new Date().toISOString()
    };

    if (!this.state.schools) this.state.schools = [];
    this.state.schools.push(newSchool);
    this.state.activeSchoolId = newSchool.id;

    // 2. Criar automaticamente o usuário Gestor (Diretor) da nova escola associado estritamente ao ID ÚNICO da escola (e não ao nome)
    const adminUser = {
      id: this.generateUniqueId('usr'),
      schoolId: newSchool.id, // Vínculo estrito por ID único
      nome: directorName || 'Diretor(a)',
      email: schoolEmail,
      password: password || '123456',
      tipo: 'gestao',
      criadoEm: new Date().toISOString()
    };

    if (!this.state.users) this.state.users = [];
    this.state.users.push(adminUser);
    this.saveState();

    // Gravação direta do gestor no Firestore na coleção 'usuarios'
    if (this.isFirebaseActive && this.db) {
      try {
        setDoc(doc(this.db, 'usuarios', adminUser.id), JSON.parse(JSON.stringify(adminUser)))
          .catch(err => console.warn('Aviso Firestore: Não foi possível gravar o gestor no Firestore agora:', err));
      } catch (e) {}
    }

    // Criação do gestor também no Firebase Authentication
    this.createUserInFirebaseAuth(adminUser.email, adminUser.password);

    // 3. Autenticar o usuário como Gestor da nova escola
    this.currentUser = adminUser;
    this.currentRole = 'gestao';
    this.isLoggedIn = true;
    localStorage.setItem('portal_current_user', JSON.stringify(adminUser));
    localStorage.removeItem('portal_active_tab');

    // 4. Feedback e transição direta para o painel da nova escola
    this.showToast(`Instituição "${schoolName}" cadastrada com sucesso! Você está conectado como Gestão.`, 'success', 'Instituição Cadastrada');
    this.checkAuthStatus();
    this.setRole('gestao');
    this.switchTab('tab-dashboard');
    this.render();
  }

  async logout() {
    const confirmed = await this.confirmAction({
      title: 'Sair do Sistema',
      message: 'Deseja realmente encerrar sua sessão no Portal do Curso?',
      confirmText: 'Sim, Sair',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (confirmed) {
      this.currentUser = null;
      this.isLoggedIn = false;
      localStorage.removeItem('portal_current_user');
      localStorage.removeItem('portal_active_tab');
      this.activeTab = 'tab-dashboard';
      this.checkAuthStatus();
      this.switchAuthMode('login');
      this.showToast('Sessão encerrada com sucesso.', 'info', 'Logout');
    }
  }

  setupEventListeners() {
    // 1. Rastrear edições em formulários modais (Dirty Form Guard)
    document.addEventListener('input', (e) => {
      const form = e.target.closest('form');
      if (form && form.closest('.modal-overlay')) {
        form.dataset.dirty = 'true';
      }
    });

    document.addEventListener('change', (e) => {
      const form = e.target.closest('form');
      if (form && form.closest('.modal-overlay')) {
        form.dataset.dirty = 'true';
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target && e.target.tagName === 'FORM') {
        e.target.dataset.dirty = 'false';
      }
    });

    // 2. Fechar modal ao clicar no fundo com verificação de alterações não salvas
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeModal(overlay.id);
        }
      });
    });

    // 3. Tecla Escape para fechar o modal aberto mais recente com segurança
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = Array.from(document.querySelectorAll('.modal-overlay.open'));
        if (openModals.length > 0) {
          const topModal = openModals[openModals.length - 1];
          if (topModal.id !== 'modal-confirm') {
            this.closeModal(topModal.id);
          }
        }
      }
    });

    // 4. Atalho Global Ctrl + K / Cmd + K para Command Palette
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const cmdModal = document.getElementById('modal-command-palette');
        if (cmdModal && cmdModal.classList.contains('open')) {
          this.closeCommandPalette();
        } else {
          this.openCommandPalette();
        }
      }
    });
  }
}

// Global Application Instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortalApp();
  window.app = app;
});
