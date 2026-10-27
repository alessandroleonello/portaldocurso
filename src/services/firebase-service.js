/**
 * Portal do Curso - Firebase & Firestore Scalability Service
 * Subcollections architecture, batching, debounce and Auth synchronization.
 */

import { firebaseConfig } from '../../firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

export class FirebaseService {
  constructor() {
    this.firebaseApp = null;
    this.db = null;
    this.auth = null;
    this.isFirebaseActive = false;
    this.debounceTimer = null;
    this.isSyncing = false;
    this.pendingSync = false;

    this.init();
  }

  init() {
    try {
      if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'SUA_API_KEY_AQUI') {
        this.firebaseApp = initializeApp(firebaseConfig);
        this.db = getFirestore(this.firebaseApp);
        this.auth = getAuth(this.firebaseApp);
        this.isFirebaseActive = true;
        console.log('🔥 [FirebaseService] Conectado ao Firestore:', firebaseConfig.projectId);
      } else {
        console.warn('⚠️ [FirebaseService] Chaves do Firebase não configuradas.');
      }
    } catch (e) {
      console.error('❌ [FirebaseService] Erro na inicialização:', e);
    }
  }

  /**
   * Sincronização inteligente com debounce para evitar requisições excessivas
   */
  scheduleSync(activeSchool, state, delay = 1000) {
    if (!this.isFirebaseActive || !activeSchool) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.syncSchoolData(activeSchool, state);
    }, delay);
  }

  /**
   * Sincronização particionada em Subcoleções
   * Evita o estouro do limite de 1MB do Firestore e melhora o desempenho drasticamente.
   */
  async syncSchoolData(activeSchool, state) {
    if (!this.isFirebaseActive || !this.db || !activeSchool || !activeSchool.id) return false;
    if (this.isSyncing) {
      this.pendingSync = true;
      return false;
    }

    this.isSyncing = true;
    try {
      const schoolId = activeSchool.id;
      const cleanSchool = JSON.parse(JSON.stringify(activeSchool));
      const cleanState = JSON.parse(JSON.stringify(state));

      // 1. Gravar metadados da instituição em 'escolas/{schoolId}'
      await setDoc(doc(this.db, 'escolas', schoolId), cleanSchool, { merge: true });

      // 2. Gravar usuários em coleção de topo com schoolId indexado
      if (Array.isArray(cleanState.users)) {
        const schoolUsers = cleanState.users.filter(u => u.schoolId === schoolId);
        for (const u of schoolUsers) {
          if (u.id) {
            await setDoc(doc(this.db, 'usuarios', u.id), u, { merge: true });
          }
        }
      }

      // 3. Gravar Cursos na subcoleção 'escolas/{schoolId}/cursos'
      if (Array.isArray(cleanState.courses)) {
        const schoolCourses = cleanState.courses.filter(c => c.schoolId === schoolId);
        for (const c of schoolCourses) {
          if (c.id) {
            await setDoc(doc(this.db, 'escolas', schoolId, 'cursos', c.id), c, { merge: true });
          }
        }
      }

      // 4. Gravar Disciplinas na subcoleção 'escolas/{schoolId}/disciplinas'
      if (Array.isArray(cleanState.disciplines)) {
        const schoolDiscs = cleanState.disciplines.filter(d => d.schoolId === schoolId);
        for (const d of schoolDiscs) {
          if (d.id) {
            await setDoc(doc(this.db, 'escolas', schoolId, 'disciplinas', d.id), d, { merge: true });
          }
        }
      }

      // 5. Gravar Turmas na subcoleção 'escolas/{schoolId}/turmas'
      if (Array.isArray(cleanState.classes)) {
        const schoolClasses = cleanState.classes.filter(t => t.schoolId === schoolId);
        for (const t of schoolClasses) {
          if (t.id) {
            await setDoc(doc(this.db, 'escolas', schoolId, 'turmas', t.id), t, { merge: true });
          }
        }
      }

      // 6. Gravar Aulas na subcoleção 'escolas/{schoolId}/aulas' com frequência anexada
      if (Array.isArray(cleanState.lessons)) {
        // Filtrar aulas pertencentes às turmas desta escola
        const schoolClassIds = new Set((cleanState.classes || []).filter(t => t.schoolId === schoolId).map(t => t.id));
        const schoolLessons = cleanState.lessons.filter(l => {
          const tId = (l.turmaId || '').split('__')[0];
          return schoolClassIds.has(tId);
        });

        for (const l of schoolLessons) {
          if (l.id) {
            const lessonPayload = {
              ...l,
              attendanceData: cleanState.attendance ? cleanState.attendance[l.id] || {} : {}
            };
            await setDoc(doc(this.db, 'escolas', schoolId, 'aulas', l.id), lessonPayload, { merge: true });
          }
        }
      }

      // 7. Gravar Avaliações em 'escolas/{schoolId}/avaliacoes'
      if (Array.isArray(cleanState.evaluations)) {
        const schoolClassIds = new Set((cleanState.classes || []).filter(t => t.schoolId === schoolId).map(t => t.id));
        const schoolEvals = cleanState.evaluations.filter(ev => {
          const tId = (ev.turmaId || '').split('__')[0];
          return schoolClassIds.has(tId) || (ev.schoolId && ev.schoolId === schoolId);
        });

        for (const ev of schoolEvals) {
          if (ev.id) {
            await setDoc(doc(this.db, 'escolas', schoolId, 'avaliacoes', ev.id), ev, { merge: true });
          }
        }
      }

      // 8. Gravar Comunicados em 'escolas/{schoolId}/comunicados'
      if (Array.isArray(cleanState.notices)) {
        const schoolNotices = cleanState.notices.filter(n => !n.schoolId || n.schoolId === schoolId);
        for (const n of schoolNotices) {
          if (n.id) {
            await setDoc(doc(this.db, 'escolas', schoolId, 'comunicados', n.id), n, { merge: true });
          }
        }
      }

      // 9. Manter documento consolidado de compatibilidade em 'portal_data/{schoolId}'
      await setDoc(doc(this.db, 'portal_data', schoolId), cleanState, { merge: true });

      console.log(`✅ [FirebaseService] Subcoleções de '${activeSchool.nome}' sincronizadas com sucesso no Firestore!`);
      return true;
    } catch (e) {
      console.error('❌ [FirebaseService] Erro na sincronização:', e);
      return false;
    } finally {
      this.isSyncing = false;
      if (this.pendingSync) {
        this.pendingSync = false;
        this.scheduleSync(activeSchool, state, 1500);
      }
    }
  }

  /**
   * Leitura inteligente com suporte a subcoleções e migração retrocompatível
   */
  async fetchSchoolData(schoolId) {
    if (!this.isFirebaseActive || !this.db || !schoolId) return null;

    try {
      const result = {
        school: null,
        courses: [],
        disciplines: [],
        classes: [],
        lessons: [],
        attendance: {},
        evaluations: [],
        financial: [],
        schedules: [],
        curriculumGrid: [],
        notices: [],
        bibliographies: [],
        issuedDocuments: [],
        users: []
      };

      // 1. Tentar ler dados consolidados em 'portal_data/{schoolId}' (garantia entre computadores)
      try {
        const portalDataSnap = await getDoc(doc(this.db, 'portal_data', schoolId));
        if (portalDataSnap.exists()) {
          const pData = portalDataSnap.data();
          if (pData.schools && Array.isArray(pData.schools)) {
            const sch = pData.schools.find(s => s.id === schoolId) || pData.schools[0];
            if (sch) result.school = sch;
          }
          if (Array.isArray(pData.courses)) result.courses.push(...pData.courses);
          if (Array.isArray(pData.disciplines)) result.disciplines.push(...pData.disciplines);
          if (Array.isArray(pData.classes)) result.classes.push(...pData.classes);
          if (Array.isArray(pData.lessons)) result.lessons.push(...pData.lessons);
          if (pData.attendance && typeof pData.attendance === 'object') Object.assign(result.attendance, pData.attendance);
          if (Array.isArray(pData.evaluations)) result.evaluations.push(...pData.evaluations);
          if (Array.isArray(pData.financial)) result.financial.push(...pData.financial);
          if (Array.isArray(pData.schedules)) result.schedules.push(...pData.schedules);
          if (Array.isArray(pData.curriculumGrid)) result.curriculumGrid.push(...pData.curriculumGrid);
          if (Array.isArray(pData.notices)) result.notices.push(...pData.notices);
          if (Array.isArray(pData.bibliographies)) result.bibliographies.push(...pData.bibliographies);
          if (Array.isArray(pData.issuedDocuments)) result.issuedDocuments.push(...pData.issuedDocuments);
          if (Array.isArray(pData.users)) result.users.push(...pData.users);
        }
      } catch (errPortal) {
        console.warn('[FirebaseService] Leitura portal_data:', errPortal.message);
      }

      // 2. Tentar ler escola individual em 'escolas/{schoolId}' caso ainda não obtida
      if (!result.school) {
        try {
          const schoolSnap = await getDoc(doc(this.db, 'escolas', schoolId));
          if (schoolSnap.exists()) {
            result.school = schoolSnap.data();
          }
        } catch (e) {}
      }

      // 3. Tentar ler subcoleções particionadas (mesclando ou preenchendo o que faltar)
      try {
        const coursesSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'cursos'));
        coursesSnap.forEach(d => {
          const item = d.data();
          const idx = result.courses.findIndex(ex => ex.id === item.id);
          if (idx >= 0) result.courses[idx] = item;
          else result.courses.push(item);
        });

        const discsSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'disciplinas'));
        discsSnap.forEach(d => {
          const item = d.data();
          const idx = result.disciplines.findIndex(ex => ex.id === item.id);
          if (idx >= 0) result.disciplines[idx] = item;
          else result.disciplines.push(item);
        });

        const classesSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'turmas'));
        classesSnap.forEach(d => {
          const item = d.data();
          const idx = result.classes.findIndex(ex => ex.id === item.id);
          if (idx >= 0) result.classes[idx] = item;
          else result.classes.push(item);
        });

        const lessonsSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'aulas'));
        lessonsSnap.forEach(d => {
          const lData = d.data();
          if (lData.attendanceData) {
            result.attendance[lData.id] = lData.attendanceData;
            delete lData.attendanceData;
          }
          const idx = result.lessons.findIndex(ex => ex.id === lData.id);
          if (idx >= 0) result.lessons[idx] = lData;
          else result.lessons.push(lData);
        });

        const evalsSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'avaliacoes'));
        evalsSnap.forEach(d => {
          const item = d.data();
          const idx = result.evaluations.findIndex(ex => ex.id === item.id);
          if (idx >= 0) result.evaluations[idx] = item;
          else result.evaluations.push(item);
        });

        const noticesSnap = await getDocs(collection(this.db, 'escolas', schoolId, 'comunicados'));
        noticesSnap.forEach(d => {
          const item = d.data();
          const idx = result.notices.findIndex(ex => ex.id === item.id);
          if (idx >= 0) result.notices[idx] = item;
          else result.notices.push(item);
        });
      } catch (errSub) {
        console.log('[FirebaseService] Subcoleções:', errSub.message);
      }

      // 4. Buscar todos os usuários vinculados à instituição na coleção de topo 'usuarios'
      try {
        const usersSnap = await getDocs(query(collection(this.db, 'usuarios'), where('schoolId', '==', schoolId)));
        usersSnap.forEach(d => {
          const u = d.data();
          const idx = result.users.findIndex(ex => ex.id === u.id);
          if (idx >= 0) result.users[idx] = u;
          else result.users.push(u);
        });
      } catch (errU) {
        console.log('[FirebaseService] Leitura query usuários:', errU.message);
      }

      return result;
    } catch (e) {
      console.warn('[FirebaseService] Erro ao carregar dados da instituição:', e);
      return null;
    }
  }

  /**
   * Leitura de todas as escolas cadastradas
   */
  async loadAllSchools() {
    if (!this.isFirebaseActive || !this.db) return [];
    try {
      const snap = await getDocs(collection(this.db, 'escolas'));
      const schools = [];
      snap.forEach(d => schools.push(d.data()));
      return schools;
    } catch (e) {
      console.warn('[FirebaseService] Falha ao listar escolas:', e);
      return [];
    }
  }

  /**
   * Firebase Auth - Criação e Login
   */
  async createAuthUser(email, password) {
    if (!this.isFirebaseActive || !this.auth || !email || !password) return null;
    try {
      return await createUserWithEmailAndPassword(this.auth, email, password);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') return { exists: true };
      console.warn('[FirebaseService] Auth create error:', e.message);
      return null;
    }
  }

  async loginAuthUser(email, password) {
    if (!this.isFirebaseActive || !this.auth || !email || !password) return null;
    try {
      return await signInWithEmailAndPassword(this.auth, email, password);
    } catch (e) {
      console.warn('[FirebaseService] Auth login error:', e.message);
      throw e;
    }
  }
}

export const firebaseService = new FirebaseService();
