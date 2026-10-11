/**
 * Portal do Curso - LocalStorage & Offline Cache Service
 */

const STORAGE_KEY = 'portal_do_curso_data';
const USER_KEY = 'portal_current_user';
const TAB_KEY = 'portal_active_tab';
const THEME_KEY = 'portal_theme';

export class StorageService {
  constructor() {}

  createInitialState() {
    return this.getInitialState();
  }

  getInitialState() {
    return {
      schools: [],
      activeSchoolId: null,
      users: [],
      courses: [],
      disciplines: [],
      classes: [],
      lessons: [],
      attendance: {},
      grades: {},
      evaluations: [],
      studentGrades: {},
      financial: [],
      bibliographies: [],
      schedules: [],
      curriculumGrid: [],
      notices: [],
      issuedDocuments: [],
      firebaseConfig: null
    };
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.getInitialState();
      const parsed = JSON.parse(raw);
      const state = Object.assign(this.getInitialState(), parsed);

      // Garantir arrays e objetos essenciais
      if (!Array.isArray(state.schools)) state.schools = [];
      if (!Array.isArray(state.users)) state.users = [];
      if (!Array.isArray(state.courses)) state.courses = [];
      if (!Array.isArray(state.disciplines)) state.disciplines = [];
      if (!Array.isArray(state.classes)) state.classes = [];
      if (!Array.isArray(state.lessons)) state.lessons = [];
      if (!Array.isArray(state.evaluations)) state.evaluations = [];
      if (!Array.isArray(state.financial)) state.financial = [];
      if (!Array.isArray(state.bibliographies)) state.bibliographies = [];
      if (!Array.isArray(state.schedules)) state.schedules = [];
      if (!Array.isArray(state.curriculumGrid)) state.curriculumGrid = [];
      if (!Array.isArray(state.notices)) state.notices = [];
      if (!Array.isArray(state.issuedDocuments)) state.issuedDocuments = [];
      if (!state.attendance || typeof state.attendance !== 'object') state.attendance = {};
      if (!state.studentGrades || typeof state.studentGrades !== 'object') state.studentGrades = {};

      return state;
    } catch (e) {
      console.error('Erro ao ler LocalStorage:', e);
      return this.getInitialState();
    }
  }

  saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Erro ao salvar no LocalStorage:', e);
    }
  }

  getCurrentUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  saveCurrentUser(user) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  getActiveTab() {
    return localStorage.getItem(TAB_KEY) || 'tab-dashboard';
  }

  saveActiveTab(tabId) {
    try {
      localStorage.setItem(TAB_KEY, tabId);
    } catch (e) {}
  }

  getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  purgeFictionalData(state, currentUser) {
    const fakeUserIds = new Set(['usr_aluno_1', 'usr_aluno_2', 'usr_dir', 'usr_sec', 'usr_prof_carlos', 'usr_prof_ana']);
    const fakeEmails = new Set(['gabriel.santos@aluno.fatech.edu.br', 'juliana.mendes@aluno.fatech.edu.br', 'mariana.direcao@fatech.edu.br', 'secretaria@fatech.edu.br', 'carlos.prof@fatech.edu.br', 'ana.prof@fatech.edu.br']);
    const fakeNames = new Set(['Gabriel Santos Silva', 'Juliana Oliveira Mendes', 'Dra. Mariana Vasconcelos', 'Roberto Alves (Secretaria)', 'Prof. Carlos Eduardo', 'Profª. Ana Beatriz']);
    const fakeSchoolIds = new Set(['sch_fatech_01']);
    const fakeCourseIds = new Set(['crs_ads', 'crs_eng_soft']);
    const fakeDiscIds = new Set(['disc_web', 'disc_db', 'disc_eng']);
    const fakeClassIds = new Set(['turma_web_01', 'turma_bd_01']);

    let modified = false;

    // 1. Limpar usuário logado se for fictício
    let activeUser = currentUser;
    if (activeUser) {
      if (fakeUserIds.has(activeUser.id) || fakeEmails.has(activeUser.email) || fakeNames.has(activeUser.nome) || (activeUser.email && activeUser.email.includes('@fatech.edu.br'))) {
        activeUser = null;
        this.saveCurrentUser(null);
        modified = true;
      }
    }

    // 2. Escolas
    if (Array.isArray(state.schools)) {
      const prev = state.schools.length;
      state.schools = state.schools.filter(s => !fakeSchoolIds.has(s.id) && s.nome !== 'Faculdade de Tecnologia & Inovação (FATECH)');
      if (state.schools.length !== prev) modified = true;
      if (state.activeSchoolId === 'sch_fatech_01' || !state.schools.some(s => s.id === state.activeSchoolId)) {
        state.activeSchoolId = state.schools[0]?.id || null;
        modified = true;
      }
    }

    // 3. Cursos
    if (Array.isArray(state.courses)) {
      const prev = state.courses.length;
      state.courses = state.courses.filter(c => !fakeCourseIds.has(c.id) && !fakeSchoolIds.has(c.schoolId));
      if (state.courses.length !== prev) modified = true;
    }

    // 4. Disciplinas
    if (Array.isArray(state.disciplines)) {
      const prev = state.disciplines.length;
      state.disciplines = state.disciplines.filter(d => !fakeDiscIds.has(d.id) && !fakeCourseIds.has(d.courseId));
      if (state.disciplines.length !== prev) modified = true;
    }

    // 5. Turmas
    if (Array.isArray(state.classes)) {
      const prev = state.classes.length;
      state.classes = state.classes.filter(t => !fakeClassIds.has(t.id) && !fakeSchoolIds.has(t.schoolId));
      if (state.classes.length !== prev) modified = true;
    }

    // 6. Usuários
    if (Array.isArray(state.users)) {
      const prev = state.users.length;
      state.users = state.users.filter(u => !fakeUserIds.has(u.id) && !fakeEmails.has(u.email) && !fakeNames.has(u.nome) && (!u.email || !u.email.includes('@fatech.edu.br')));
      if (state.users.length !== prev) modified = true;
    }

    // 7. Avaliações
    if (Array.isArray(state.evaluations)) {
      const prev = state.evaluations.length;
      state.evaluations = state.evaluations.filter(e => !fakeClassIds.has(e.turmaId) && !['eval_01', 'eval_02', 'eval_03'].includes(e.id));
      if (state.evaluations.length !== prev) modified = true;
    }

    if (state.studentGrades) {
      Object.keys(state.studentGrades).forEach(k => {
        if (k.includes('usr_aluno_1') || k.includes('usr_aluno_2')) {
          delete state.studentGrades[k];
          modified = true;
        }
      });
    }

    if (modified) {
      this.saveState(state);
      console.log('🧹 [StorageService] Dados fictícios purgados com sucesso.');
    }

    return modified;
  }
}

export const storageService = new StorageService();
