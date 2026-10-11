/**
 * Portal do Curso - Lesson & Attendance Module (Diário, Materiais & Chamada Ágil)
 */

export class LessonModule {
  constructor(app) {
    this.app = app;
  }

  renderLessonsList() {
    const courseSelect = document.getElementById('lesson-filter-curso');
    const turmaSelect = document.getElementById('lesson-filter-turma');
    const container = document.getElementById('lessons-list-container');
    const titleEl = document.getElementById('lesson-selected-turma-title');
    const subtitleEl = document.getElementById('lesson-selected-turma-subtitle');
    const badgeEl = document.getElementById('lesson-role-context-badge');

    if (!container) return;

    if (badgeEl) {
      if (this.app.currentRole === 'professor') {
        badgeEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Cursos sob sua docência`;
      } else if (this.app.currentRole === 'aluno') {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Cursos em que você está matriculado`;
      } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-school"></i> Gestão de todas as turmas`;
      }
    }

    const { relevantTurmas, availableCourses } = this.app.getTeacherAvailableCoursesAndClasses();

    // 1. Preencher Cursos disponíveis
    if (courseSelect) {
      if (availableCourses.length === 0) {
        courseSelect.innerHTML = `<option value="">Nenhum curso disponível</option>`;
        if (turmaSelect) turmaSelect.innerHTML = `<option value="">Nenhuma turma disponível</option>`;
        container.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">Nenhum curso ou turma vinculado a este perfil na instituição.</p>`;
        if (titleEl) titleEl.textContent = 'Aulas Registradas';
        if (subtitleEl) subtitleEl.textContent = 'Sem turmas disponíveis';
        return;
      }

      courseSelect.innerHTML = availableCourses.map(c => 
        `<option value="${c.id}">${this.app.escapeHTML(c.code ? c.code + ' - ' : '')}${this.app.escapeHTML(c.name)}</option>`
      ).join('');

      if (!this.app.selectedLessonCourseId || !availableCourses.some(c => c.id === this.app.selectedLessonCourseId)) {
        this.app.selectedLessonCourseId = availableCourses[0].id;
      }
      courseSelect.value = this.app.selectedLessonCourseId;
    }

    // 2. Preencher Turmas do curso selecionado
    const courseTurmas = relevantTurmas.filter(t => t.courseId === this.app.selectedLessonCourseId);

    if (turmaSelect) {
      if (courseTurmas.length === 0) {
        turmaSelect.innerHTML = `<option value="">Nenhuma turma encontrada para este curso</option>`;
        container.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">Nenhuma turma vinculada a este curso sob sua responsabilidade.</p>`;
        if (titleEl) titleEl.textContent = 'Aulas Registradas';
        if (subtitleEl) subtitleEl.textContent = 'Selecione outro curso acima';
        return;
      }

      let turmaOptionsHTML = '';
      const validTurmaValues = [];

      courseTurmas.forEach(t => {
        this.app.ensureTurmaDisciplines(t);
        const activeDiscs = (t.disciplines || []).filter(d => d.status !== 'arquivada');

        if (activeDiscs.length === 0) {
          const val = t.id;
          validTurmaValues.push(val);
          turmaOptionsHTML += `<option value="${val}">${this.app.escapeHTML(t.nome)}</option>`;
        } else {
          activeDiscs.forEach(td => {
            const disc = (this.app.state.disciplines || []).find(d => d.id === td.disciplineId);
            const discName = disc ? disc.name : 'Disciplina';
            const periodStr = td.periodo ? ` [${td.periodo}]` : '';
            const isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
            const sharedStr = isShared ? ' (Aula Conjunta)' : '';
            const val = `${t.id}__${td.id}`;
            validTurmaValues.push(val);
            turmaOptionsHTML += `<option value="${val}">${this.app.escapeHTML(t.nome)} • ${this.app.escapeHTML(discName)}${periodStr}${sharedStr}</option>`;
          });
        }
      });

      turmaSelect.innerHTML = turmaOptionsHTML;

      if (!this.app.selectedLessonTurmaId || !validTurmaValues.includes(this.app.selectedLessonTurmaId)) {
        this.app.selectedLessonTurmaId = validTurmaValues[0] || null;
      }
      turmaSelect.value = this.app.selectedLessonTurmaId || '';
    }

    // 3. Obter dados da turma selecionada para os títulos
    const [selectedTurmaId, selectedTdId] = (this.app.selectedLessonTurmaId || '').split('__');
    const selectedTurma = (this.app.state.classes || []).find(t => t.id === selectedTurmaId);
    let selectedDiscName = '';
    if (selectedTurma && selectedTdId && selectedTurma.disciplines) {
      const td = selectedTurma.disciplines.find(d => d.id === selectedTdId);
      if (td) {
        const disc = (this.app.state.disciplines || []).find(d => d.id === td.disciplineId);
        if (disc) selectedDiscName = disc.name;
      }
    }

    if (titleEl) {
      if (selectedTurma) {
        titleEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> ${this.app.escapeHTML(selectedTurma.nome)} ${selectedDiscName ? `• <span style="color:var(--primary);">${this.app.escapeHTML(selectedDiscName)}</span>` : ''}`;
      } else {
        titleEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Aulas Registradas`;
      }
    }

    if (subtitleEl) {
      if (selectedTurma) {
        const course = (this.app.state.courses || []).find(c => c.id === selectedTurma.courseId);
        const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline ? this.app.getEnrolledStudentsForTurmaDiscipline(selectedTurmaId, selectedTdId) : (selectedTurma.studentIds || []);
        const enrolledCount = enrolledStudents.length;
        subtitleEl.textContent = `Curso: ${course ? course.name : '-'} | Alunos matriculados nesta disciplina: ${enrolledCount}`;
      } else {
        subtitleEl.textContent = 'Carregando informações da turma selecionada...';
      }
    }

    if (!selectedTurma) {
      container.innerHTML = `<p style="color:var(--text-muted); padding:1rem;">Nenhuma turma selecionada.</p>`;
      return;
    }

    // 4. Filtrar aulas pertencentes a esta turma e disciplina
    let turmaLessons = (this.app.state.lessons || []).filter(l => {
      if (l.turmaId === this.app.selectedLessonTurmaId) return true;
      if (l.turmaId === selectedTurmaId && !selectedTdId) return true;
      if (l.turmaId && l.turmaId.split('__')[0] === selectedTurmaId && !selectedTdId) return true;
      return false;
    });

    turmaLessons.sort((a, b) => ((b.data || b.date || '')).localeCompare(a.data || a.date || ''));

    if (turmaLessons.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; background: var(--bg-card);">
          <div style="font-size: 2.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            <i class="fa-solid fa-chalkboard-user"></i>
          </div>
          <h4 style="font-size: 1.15rem; color: var(--text-main); font-weight: 700;">Nenhuma aula registrada nesta turma ainda</h4>
          <p style="font-size: 0.88rem; color: var(--text-muted); max-width: 460px; margin: 0.5rem auto 1.25rem; line-height: 1.5;">
            Inicie o diário de classe desta disciplina cadastrando o plano e conteúdo ministrado da primeira aula.
          </p>
          <button type="button" class="btn btn-primary btn-sm role-access-professor" onclick="app.openLessonModal()">
            <i class="fa-solid fa-plus"></i> Cadastrar Primeira Aula
          </button>
        </div>
      `;
      this.app.updateNavVisibility();
      return;
    }

    // 5. Renderizar lista de aulas com resumo de chamada e anexo de material
    container.innerHTML = turmaLessons.map(les => {
      const rawTurmaId = les.turmaId || '';
      const [lTId, lTdId] = rawTurmaId.split('__');
      const turma = (this.app.state.classes || []).find(t => t.id === (lTId || les.turmaId));
      
      let disc = null;
      let td = null;
      if (turma) {
        this.app.ensureTurmaDisciplines(turma);
        if (lTdId && turma.disciplines) {
          td = turma.disciplines.find(d => d.id === lTdId);
          if (td) {
            disc = (this.app.state.disciplines || []).find(d => d.id === td.disciplineId);
          }
        }
        if (!disc) {
          disc = (this.app.state.disciplines || []).find(d => d.id === turma.disciplineId);
        }
      }
      
      const attendanceData = this.app.state.attendance[les.id];
      const hasAttendance = attendanceData && Object.keys(attendanceData).length > 0;
      const countPresent = hasAttendance ? Object.values(attendanceData).filter(v => v === 'Presente' || v === 'Justificado').length : 0;
      const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline ? this.app.getEnrolledStudentsForTurmaDiscipline(lTId || les.turmaId, lTdId) : (turma && turma.studentIds ? turma.studentIds : []);
      const totalStudents = enrolledStudents.length || (turma && turma.studentIds ? turma.studentIds.length : 0);
      const isJoint = td && Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;

      const isTeacherOrAdmin = (this.app.currentRole === 'professor' || this.app.currentRole === 'gestao' || this.app.currentRole === 'secretaria');
      const lessonDate = les.data || les.date || '';
      const lessonTitle = les.titulo || les.title || 'Aula';
      const lessonContent = les.conteudo || les.summary || '';

      return `
        <div class="card lesson-card-compact">
          <div style="display:flex; align-items:center; gap:0.45rem; overflow:hidden; flex:1; min-width:0;">
            <span class="badge badge-primary" style="font-size:0.7rem; padding:1px 5px; flex-shrink:0;">
              <i class="fa-solid fa-calendar-day"></i> ${this.app.escapeHTML(this.app.formatDateBR(lessonDate))}
            </span>
            <strong style="font-size:0.88rem; color:var(--text-main); font-family:var(--font-heading); white-space:nowrap; flex-shrink:0;">
              ${this.app.escapeHTML(lessonTitle)}
            </strong>
            ${disc ? `<span class="badge badge-info" style="font-size:0.66rem; padding:1px 5px; flex-shrink:0;">${this.app.escapeHTML(disc.name)}</span>` : ''}
            ${isJoint ? `<span class="badge" style="background:#6366f1; color:#fff; font-size:0.65rem; padding:1px 4px; flex-shrink:0;"><i class="fa-solid fa-people-arrows"></i> Conjunta</span>` : ''}
            ${hasAttendance 
              ? `<span class="badge badge-success" style="font-size:0.66rem; padding:1px 5px; flex-shrink:0;"><i class="fa-solid fa-check"></i> ${countPresent}/${totalStudents}</span>`
              : `<span class="badge badge-warning" style="font-size:0.66rem; padding:1px 5px; flex-shrink:0;"><i class="fa-solid fa-clock"></i> Pendente</span>`}
            ${lessonContent ? `
              <span style="font-size:0.78rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-left:3px;" title="${this.app.escapeHTML(lessonContent)}">
                — ${this.app.escapeHTML(lessonContent)}
              </span>
            ` : ''}
            ${les.materialUrl ? `
              <a href="${this.app.escapeHTML(les.materialUrl)}" target="_blank" rel="noopener noreferrer" class="badge badge-info" style="font-size:0.68rem; padding:1px 6px; flex-shrink:0; text-decoration:none; display:inline-flex; align-items:center; gap:3px;" title="${this.app.escapeHTML(les.materialTitle || 'Material de Aula')}">
                <i class="fa-solid fa-paperclip"></i> ${this.app.escapeHTML(les.materialTitle || 'Material')}
              </a>
            ` : ''}
          </div>

          ${isTeacherOrAdmin ? `
            <div class="lesson-card-actions">
              <button type="button" class="btn btn-primary btn-sm" onclick="app.openAttendanceForLesson('${les.id}')" title="Registrar frequência / chamada" style="padding:0 7px; font-size:0.72rem; height:24px; line-height:24px; border-radius:4px; display:inline-flex; align-items:center; gap:3px; flex-shrink:0;">
                <i class="fa-solid fa-clipboard-user"></i> ${hasAttendance ? 'Chamada' : 'Frequência'}
              </button>
              <button type="button" class="action-btn-circle" onclick="app.openEditLessonModal('${les.id}')" title="Editar Aula" style="color:var(--primary); border-color:var(--primary); flex-shrink:0;">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" class="action-btn-circle delete-btn" onclick="app.deleteLesson('${les.id}')" title="Excluir Aula" style="flex-shrink:0;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this.app.updateNavVisibility();
  }

  openLessonModal() {
    if (!this.app.checkPermission(['gestao', 'professor'], 'abrir registro de aula')) return;
    this.app.populateSelectDropdowns();

    const editIdEl = document.getElementById('lesson-edit-id');
    if (editIdEl) editIdEl.value = '';

    const titleEl = document.getElementById('modal-lesson-title');
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i> Cadastrar Aula no Diário';

    const saveBtn = document.getElementById('btn-save-lesson');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Aula';

    const turmaSelect = document.getElementById('lesson-turma');
    if (turmaSelect && this.app.selectedLessonTurmaId) {
      turmaSelect.value = this.app.selectedLessonTurmaId;
    }

    const dataInput = document.getElementById('lesson-data');
    if (dataInput && !dataInput.value) {
      dataInput.value = new Date().toISOString().split('T')[0];
    }

    const tituloInput = document.getElementById('lesson-titulo');
    if (tituloInput) tituloInput.value = '';

    const conteudoInput = document.getElementById('lesson-conteudo');
    if (conteudoInput) conteudoInput.value = '';

    const matTitleInput = document.getElementById('lesson-material-title');
    if (matTitleInput) matTitleInput.value = '';

    const matUrlInput = document.getElementById('lesson-material-url');
    if (matUrlInput) matUrlInput.value = '';

    document.getElementById('modal-lesson').classList.add('open');
  }

  openEditLessonModal(lessonId) {
    if (!this.app.checkPermission(['gestao', 'professor'], 'editar aula')) return;
    const lesson = (this.app.state.lessons || []).find(l => l.id === lessonId);
    if (!lesson) {
      this.app.showToast('Aula não encontrada.', 'danger');
      return;
    }

    this.app.populateSelectDropdowns();

    const editIdEl = document.getElementById('lesson-edit-id');
    if (editIdEl) editIdEl.value = lesson.id;

    const titleEl = document.getElementById('modal-lesson-title');
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Aula do Diário';

    const saveBtn = document.getElementById('btn-save-lesson');
    if (saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';

    const turmaSelect = document.getElementById('lesson-turma');
    if (turmaSelect && lesson.turmaId) {
      turmaSelect.value = lesson.turmaId;
    }

    const dataInput = document.getElementById('lesson-data');
    if (dataInput) dataInput.value = lesson.data || '';

    const tituloInput = document.getElementById('lesson-titulo');
    if (tituloInput) tituloInput.value = lesson.titulo || '';

    const conteudoInput = document.getElementById('lesson-conteudo');
    if (conteudoInput) conteudoInput.value = lesson.conteudo || '';

    const matTitleInput = document.getElementById('lesson-material-title');
    if (matTitleInput) matTitleInput.value = lesson.materialTitle || '';

    const matUrlInput = document.getElementById('lesson-material-url');
    if (matUrlInput) matUrlInput.value = lesson.materialUrl || '';

    document.getElementById('modal-lesson').classList.add('open');
  }

  handleSaveLesson(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'professor'], 'registrar aulas')) return;

    const editId = document.getElementById('lesson-edit-id')?.value;
    const turmaId = document.getElementById('lesson-turma').value;
    const data = document.getElementById('lesson-data').value;
    const titulo = document.getElementById('lesson-titulo').value.trim();
    const conteudo = document.getElementById('lesson-conteudo').value.trim();
    const materialTitle = document.getElementById('lesson-material-title')?.value.trim() || '';
    const materialUrl = document.getElementById('lesson-material-url')?.value.trim() || '';

    if (!turmaId) {
      this.app.showToast('Por favor, selecione uma turma/disciplina.', 'warning');
      return;
    }

    if (!this.app.state.lessons) this.app.state.lessons = [];

    if (editId) {
      const idx = this.app.state.lessons.findIndex(l => l.id === editId);
      if (idx !== -1) {
        this.app.state.lessons[idx] = {
          ...this.app.state.lessons[idx],
          turmaId,
          data,
          titulo,
          conteudo,
          materialTitle,
          materialUrl
        };
      }
      this.app.saveState();
      this.app.closeModal('modal-lesson');
      this.app.showToast('Aula atualizada com sucesso no diário!', 'success');
      this.app.render();
    } else {
      const newLesson = {
        id: 'les_' + Date.now(),
        turmaId,
        data,
        titulo,
        conteudo,
        materialTitle,
        materialUrl
      };
      this.app.state.lessons.push(newLesson);
      this.app.saveState();
      this.app.closeModal('modal-lesson');
      this.app.showToast('Aula cadastrada no diário de classe com sucesso!', 'success');
      this.app.render();
    }
  }

  async deleteLesson(lessonId) {
    if (!this.app.checkPermission(['gestao', 'professor'], 'excluir aula')) return;
    const confirmed = await this.app.confirmAction({
      title: 'Excluir Aula do Diário',
      message: 'Tem certeza que deseja remover este registro de aula e sua respectiva chamada?',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.app.state.lessons = (this.app.state.lessons || []).filter(l => l.id !== lessonId);
      if (this.app.state.attendance) delete this.app.state.attendance[lessonId];
      this.app.saveState();
      this.app.showToast('Aula removida com sucesso.', 'success');
      this.app.render();
    }
  }

  openAttendanceForLesson(lessonId) {
    if (!this.app.checkPermission(['gestao', 'professor'], 'lançar frequência')) return;
    const lesson = (this.app.state.lessons || []).find(l => l.id === lessonId);
    if (!lesson) return;

    this.app.activeLessonId = lesson.id;
    this.currentFocusedRowIndex = 0;

    // 1. Restaurar rascunho de chamada se existir no localStorage
    const draftKey = `portal_draft_att_${lesson.id}`;
    const savedDraftRaw = localStorage.getItem(draftKey);
    let restoredFromDraft = false;

    if (savedDraftRaw) {
      try {
        const parsedDraft = JSON.parse(savedDraftRaw);
        if (parsedDraft && typeof parsedDraft === 'object' && Object.keys(parsedDraft).length > 0) {
          this.app.tempLessonAttendance = Object.assign({}, parsedDraft);
          restoredFromDraft = true;
        }
      } catch (e) {
        console.warn('Aviso: Leitura do rascunho de chamada:', e);
      }
    }

    if (!restoredFromDraft) {
      this.app.tempLessonAttendance = Object.assign({}, this.app.state.attendance[lesson.id] || {});
    } else {
      this.app.showToast('Rascunho de chamada em andamento recuperado com sucesso.', 'info', 'Rascunho Restaurado');
    }

    const infoEl = document.getElementById('attendance-lesson-info');
    if (infoEl) {
      const rawTurmaId = lesson.turmaId || '';
      const [turmaId, tdId] = rawTurmaId.split('__');
      const turma = this.app.state.classes.find(t => t.id === (turmaId || lesson.turmaId));
      let discName = '';
      if (turma) {
        this.app.ensureTurmaDisciplines(turma);
        if (tdId && turma.disciplines) {
          const td = turma.disciplines.find(d => d.id === tdId);
          if (td) {
            const d = this.app.state.disciplines.find(item => item.id === td.disciplineId);
            if (d) discName = d.name;
          }
        }
        if (!discName) {
          const d = this.app.state.disciplines.find(item => item.id === turma.disciplineId);
          if (d) discName = d.name;
        }
      }

      infoEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <strong style="color:var(--text-main); font-size:1.05rem;">${this.app.escapeHTML(lesson.titulo)}</strong>
            <div style="font-size:0.84rem; color:var(--text-muted); margin-top:2px;">
              <span><i class="fa-solid fa-users"></i> ${turma ? this.app.escapeHTML(turma.nome) : 'Turma'}</span>
              ${discName ? ` • <span><i class="fa-solid fa-book"></i> ${this.app.escapeHTML(discName)}</span>` : ''}
              • <span><i class="fa-solid fa-calendar-day"></i> ${this.app.formatDateBR(lesson.data)}</span>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="app.openTurmaAttendanceSummaryModal('${lesson.id}')">
            <i class="fa-solid fa-chart-pie"></i> Ver Resumo Acumulado
          </button>
        </div>
      `;
    }

    const [tId, parsedTdId] = (lesson.turmaId || '').split('__');
    const turmaObj = this.app.state.classes.find(t => t.id === (tId || lesson.turmaId));
    this.renderLessonAttendanceTable(turmaObj, parsedTdId);
    this.setupAttendanceKeyboardListeners();
    document.getElementById('modal-attendance-lesson').classList.add('open');
  }

  persistAttendanceDraft(lessonId) {
    if (!lessonId) return;
    try {
      localStorage.setItem(`portal_draft_att_${lessonId}`, JSON.stringify(this.app.tempLessonAttendance || {}));
    } catch (e) {}
  }

  setupAttendanceKeyboardListeners() {
    if (this._attendanceKeyHandler) return;
    this._attendanceKeyHandler = (e) => {
      const modal = document.getElementById('modal-attendance-lesson');
      if (!modal || !modal.classList.contains('open')) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      const rows = Array.from(document.querySelectorAll('#attendance-lesson-tbody tr[data-student-id]'));
      if (rows.length === 0) return;

      let activeRowIdx = rows.findIndex(r => r.classList.contains('attendance-row-focused'));
      if (activeRowIdx === -1) activeRowIdx = this.currentFocusedRowIndex || 0;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(rows.length - 1, activeRowIdx + 1);
        this.focusAttendanceRow(nextIdx, rows);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, activeRowIdx - 1);
        this.focusAttendanceRow(prevIdx, rows);
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const stId = rows[activeRowIdx]?.dataset.studentId;
        if (stId) {
          this.setStudentPresenceInLesson(stId, 'Presente');
          const nextIdx = Math.min(rows.length - 1, activeRowIdx + 1);
          setTimeout(() => this.focusAttendanceRow(nextIdx), 30);
        }
      } else if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const stId = rows[activeRowIdx]?.dataset.studentId;
        if (stId) {
          this.setStudentPresenceInLesson(stId, 'Ausente');
          const nextIdx = Math.min(rows.length - 1, activeRowIdx + 1);
          setTimeout(() => this.focusAttendanceRow(nextIdx), 30);
        }
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const stId = rows[activeRowIdx]?.dataset.studentId;
        if (stId) {
          this.setStudentPresenceInLesson(stId, 'Justificado');
          const nextIdx = Math.min(rows.length - 1, activeRowIdx + 1);
          setTimeout(() => this.focusAttendanceRow(nextIdx), 30);
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.saveLessonAttendance();
      }
    };
    document.addEventListener('keydown', this._attendanceKeyHandler);
  }

  focusAttendanceRow(idx, rows = null) {
    const allRows = rows || Array.from(document.querySelectorAll('#attendance-lesson-tbody tr[data-student-id]'));
    this.currentFocusedRowIndex = idx;
    allRows.forEach((r, i) => {
      if (i === idx) {
        r.classList.add('attendance-row-focused');
        r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        r.classList.remove('attendance-row-focused');
      }
    });
  }

  renderLessonAttendanceTable(turma, tdId) {
    const tbody = document.getElementById('attendance-lesson-tbody');
    if (!tbody) return;

    const lesson = this.app.state.lessons.find(l => l.id === this.app.activeLessonId);
    const lessonTurmaId = lesson ? lesson.turmaId : (turma ? turma.id : '');
    const [tId, parsedTdId] = (lessonTurmaId || '').split('__');
    const effectiveTurmaId = tId || (turma ? turma.id : '');
    const effectiveTdId = parsedTdId || tdId;

    const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(effectiveTurmaId, effectiveTdId);

    if (enrolledStudents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Nenhum aluno matriculado nesta disciplina.</td></tr>`;
      const summaryBar = document.getElementById('attendance-summary-bar');
      if (summaryBar) summaryBar.innerHTML = '';
      return;
    }

    // Calcular estatísticas em tempo real da chamada
    let countPresentes = 0;
    let countAusentes = 0;
    let countJustificados = 0;

    enrolledStudents.forEach(aluno => {
      const st = this.app.tempLessonAttendance[aluno.id] || 'Presente';
      if (st === 'Presente') countPresentes++;
      else if (st === 'Ausente') countAusentes++;
      else if (st === 'Justificado') countJustificados++;
    });

    const totalStudents = enrolledStudents.length;
    const taxaPresenca = totalStudents > 0 ? Math.round(((countPresentes + countJustificados) / totalStudents) * 100) : 100;

    const summaryBar = document.getElementById('attendance-summary-bar');
    if (summaryBar) {
      summaryBar.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.6rem;">
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.78rem; font-weight: 600; color: #059669;"><i class="fa-solid fa-circle-check"></i> Presentes</span>
            <strong style="font-size: 1.1rem; color: #047857;">${countPresentes}</strong>
          </div>
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.78rem; font-weight: 600; color: #dc2626;"><i class="fa-solid fa-circle-xmark"></i> Ausentes</span>
            <strong style="font-size: 1.1rem; color: #b91c1c;">${countAusentes}</strong>
          </div>
          <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.78rem; font-weight: 600; color: #2563eb;"><i class="fa-solid fa-clock-rotate-left"></i> Justificados</span>
            <strong style="font-size: 1.1rem; color: #1d4ed8;">${countJustificados}</strong>
          </div>
          <div style="background: var(--bg-card-secondary, rgba(0,0,0,0.03)); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);"><i class="fa-solid fa-chart-pie"></i> Assiduidade</span>
            <strong style="font-size: 1.1rem; color: ${taxaPresenca >= 75 ? '#059669' : '#dc2626'};">${taxaPresenca}%</strong>
          </div>
        </div>
      `;
    }

    const turmaLessons = (this.app.state.lessons || []).filter(l => {
      const lTurmaId = (l.turmaId || '').split('__')[0];
      return lTurmaId === effectiveTurmaId;
    });
    const totalLessons = turmaLessons.length;

    tbody.innerHTML = enrolledStudents.map((aluno, idx) => {
      const currentStatus = this.app.tempLessonAttendance[aluno.id] || 'Presente';
      const isFocused = idx === (this.currentFocusedRowIndex || 0);
      const turmaBadge = aluno.isJoint 
        ? `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; font-size:0.72rem; margin-left:6px;"><i class="fa-solid fa-people-arrows"></i> ${this.app.escapeHTML(aluno.originTurmaNome)}</span>`
        : '';

      let presencas = 0;
      turmaLessons.forEach(l => {
        const att = this.app.state.attendance ? this.app.state.attendance[l.id] : null;
        if (att && att[aluno.id]) {
          if (att[aluno.id] === 'Presente' || att[aluno.id] === 'Justificado') presencas++;
        } else {
          presencas++;
        }
      });
      const freqPct = totalLessons > 0 ? Math.round((presencas / totalLessons) * 100) : 100;
      const isRisco = freqPct < 75;

      return `
        <tr data-student-id="${aluno.id}" class="${isFocused ? 'attendance-row-focused' : ''}" onclick="app.lessonModule.focusAttendanceRow(${idx})" style="cursor: pointer; transition: background 0.15s ease;">
          <td><span class="ra-badge">${aluno.ra || '-'}</span></td>
          <td>
            <strong>${this.app.escapeHTML(aluno.nome)}</strong>
            ${turmaBadge}
          </td>
          <td style="text-align: center;">
            <span class="badge ${freqPct >= 75 ? 'badge-success' : 'badge-danger'}" style="font-weight: 700;">${freqPct}%</span>
            ${isRisco ? `<span class="badge badge-danger" title="Risco de Reprovação por Faltas (< 75%)" style="margin-left: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> Risco</span>` : ''}
          </td>
          <td style="text-align: center;">
            <div style="display:flex; justify-content:center; gap:0.35rem;">
              <button type="button" class="btn btn-sm ${currentStatus === 'Presente' ? 'btn-success' : 'btn-secondary'}" onclick="event.stopPropagation(); app.setStudentPresenceInLesson('${aluno.id}', 'Presente')">
                <i class="fa-solid fa-check"></i> Presente
              </button>
              <button type="button" class="btn btn-sm ${currentStatus === 'Ausente' ? 'btn-danger' : 'btn-secondary'}" onclick="event.stopPropagation(); app.setStudentPresenceInLesson('${aluno.id}', 'Ausente')">
                <i class="fa-solid fa-xmark"></i> Ausente
              </button>
              <button type="button" class="btn btn-sm ${currentStatus === 'Justificado' ? 'btn-primary' : 'btn-secondary'}" onclick="event.stopPropagation(); app.setStudentPresenceInLesson('${aluno.id}', 'Justificado')">
                <i class="fa-solid fa-triangle-exclamation"></i> Justificado
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  setStudentPresenceInLesson(studentId, status) {
    this.app.tempLessonAttendance[studentId] = status;
    this.persistAttendanceDraft(this.app.activeLessonId);
    const lesson = this.app.state.lessons.find(l => l.id === this.app.activeLessonId);
    const [turmaId, tdId] = (lesson ? lesson.turmaId : '').split('__');
    const turma = lesson ? this.app.state.classes.find(t => t.id === (turmaId || lesson.turmaId)) : null;
    this.renderLessonAttendanceTable(turma, tdId);
  }

  markAllPresentInLesson() {
    const lesson = this.app.state.lessons.find(l => l.id === this.app.activeLessonId);
    if (!lesson) return;
    const [turmaId, tdId] = (lesson.turmaId || '').split('__');
    const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(turmaId || lesson.turmaId, tdId);
    enrolledStudents.forEach(st => {
      this.app.tempLessonAttendance[st.id] = 'Presente';
    });
    this.persistAttendanceDraft(this.app.activeLessonId);
    const turma = this.app.state.classes.find(t => t.id === (turmaId || lesson.turmaId));
    this.renderLessonAttendanceTable(turma, tdId);
    this.app.showToast('Todos os alunos foram marcados como presentes.', 'success');
  }

  markAllAbsentInLesson() {
    const lesson = this.app.state.lessons.find(l => l.id === this.app.activeLessonId);
    if (!lesson) return;
    const [turmaId, tdId] = (lesson.turmaId || '').split('__');
    const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(turmaId || lesson.turmaId, tdId);
    enrolledStudents.forEach(st => {
      this.app.tempLessonAttendance[st.id] = 'Ausente';
    });
    this.persistAttendanceDraft(this.app.activeLessonId);
    const turma = this.app.state.classes.find(t => t.id === (turmaId || lesson.turmaId));
    this.renderLessonAttendanceTable(turma, tdId);
    this.app.showToast('Todos os alunos foram marcados como ausentes.', 'info');
  }

  saveLessonAttendance() {
    if (!this.app.activeLessonId) return;
    this.app.state.attendance[this.app.activeLessonId] = Object.assign({}, this.app.tempLessonAttendance);
    try {
      localStorage.removeItem(`portal_draft_att_${this.app.activeLessonId}`);
    } catch (e) {}
    this.app.saveState();
    this.app.closeModal('modal-attendance-lesson');
    this.app.showToast('Frequência da aula registrada e salva com sucesso!', 'success');
    this.app.render();
  }

  openTurmaAttendanceSummaryModal(lessonId) {
    const lesson = (this.app.state.lessons || []).find(l => l.id === lessonId);
    if (!lesson) return;

    const [turmaId, tdId] = (lesson.turmaId || '').split('__');
    const turma = this.app.state.classes.find(t => t.id === (turmaId || lesson.turmaId));
    if (!turma) return;

    this.app.ensureTurmaDisciplines(turma);
    const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(turmaId || lesson.turmaId, tdId);

    const titleEl = document.getElementById('turma-summary-info');
    if (titleEl) {
      titleEl.innerHTML = `<strong>Turma:</strong> ${this.app.escapeHTML(turma.nome)} • Total de Alunos: <strong>${enrolledStudents.length}</strong>`;
    }

    const tbody = document.getElementById('turma-summary-tbody');
    if (tbody) {
      const relevantLessons = (this.app.state.lessons || []).filter(l => {
        const [lTId] = (l.turmaId || '').split('__');
        return lTId === turma.id;
      });
      const totalLessons = relevantLessons.length;

      tbody.innerHTML = enrolledStudents.map(aluno => {
        let pres = 0;
        let falt = 0;
        relevantLessons.forEach(les => {
          const att = this.app.state.attendance[les.id];
          if (att && att[aluno.id]) {
            if (att[aluno.id] === 'Presente' || att[aluno.id] === 'Justificado') pres++;
            else if (att[aluno.id] === 'Ausente') falt++;
          } else {
            pres++;
          }
        });
        const pct = totalLessons > 0 ? Math.round((pres / totalLessons) * 100) : 100;
        return `
          <tr>
            <td><span class="ra-badge">${aluno.ra || '-'}</span></td>
            <td><strong>${this.app.escapeHTML(aluno.nome)}</strong></td>
            <td>${totalLessons}</td>
            <td><strong style="color:var(--success);">${pres}</strong></td>
            <td><strong style="color:var(--danger);">${falt}</strong></td>
            <td><span class="badge ${pct >= 75 ? 'badge-success' : 'badge-danger'}">${pct}%</span></td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('modal-turma-attendance-summary').classList.add('open');
  }
}
