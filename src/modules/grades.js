/**
 * grades.js - Módulo de Avaliações, Notas e Critérios de Aprovação
 * Portal do Curso
 */

export class GradeModule {
  constructor(app) {
    this.app = app;
  }

  get state() {
    return this.app.state;
  }

  handleGradesCourseChange() {
    const courseSelect = document.getElementById('notas-filter-curso');
    if (courseSelect) {
      this.app.selectedGradeCourseId = courseSelect.value;
      this.app.selectedGradeTurmaId = null;
      this.renderGradesTable();
    }
  }

  handleGradesTurmaChange() {
    const turmaSelect = document.getElementById('notas-filter-turma');
    if (turmaSelect) {
      this.app.selectedGradeTurmaId = turmaSelect.value;
      this.renderGradesTable();
    }
  }

  getEvaluationsForTurmaDiscipline(turmaId, tdId) {
    if (!this.state.evaluations) this.state.evaluations = [];
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) return [];

    this.app.ensureTurmaDisciplines(turma);

    let targetDisciplineId = null;
    let sharedTurmaIds = [];
    if (tdId && turma.disciplines) {
      const td = turma.disciplines.find(d => d.id === tdId);
      if (td) {
        targetDisciplineId = td.disciplineId;
        sharedTurmaIds = Array.isArray(td.sharedWithTurmaIds) ? td.sharedWithTurmaIds : [];
      }
    }

    const rawId = tdId ? `${turmaId}__${tdId}` : turmaId;

    return this.state.evaluations.filter(ev => {
      // 1. Match direto por rawTurmaId ou turmaId__tdId
      if (ev.rawTurmaId && ev.rawTurmaId === rawId) return true;
      if (ev.turmaId === rawId) return true;

      // 2. Match por turmaId e turmaDisciplinaId
      if (ev.turmaId === turmaId && ev.turmaDisciplinaId === tdId) return true;

      // 3. Match por aula conjunta compartilhada da MESMA disciplina
      if (targetDisciplineId && ev.disciplineId === targetDisciplineId) {
        if (sharedTurmaIds.includes(ev.turmaId) || (ev.rawTurmaId && sharedTurmaIds.includes(ev.rawTurmaId.split('__')[0]))) {
          return true;
        }
      }

      // 4. Compatibilidade legado: se salvo só com turmaId e turma tem apenas esta disciplina ativa
      if (!ev.turmaDisciplinaId && !ev.rawTurmaId && ev.turmaId === turmaId) {
        const activeDiscs = (turma.disciplines || []).filter(d => d.status !== 'arquivada');
        if (activeDiscs.length > 0 && activeDiscs[0].id === tdId) {
          return true;
        }
      }

      return false;
    });
  }

  getGradeCalcType(turmaId, tdId) {
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) return 'aritmetica';
    this.app.ensureTurmaDisciplines(turma);
    if (tdId && turma.disciplines) {
      const td = turma.disciplines.find(d => d.id === tdId);
      if (td && td.tipoMedia) return td.tipoMedia;
    }
    return turma.tipoMedia || 'aritmetica';
  }

  async handleGradeCalcTypeChange(newType) {
    if (!this.app.checkPermission(['gestao', 'professor'], 'alterar forma de cálculo da média')) return;
    if (!this.app.selectedGradeTurmaId) return;

    const [selectedTId, selectedTdId] = this.app.selectedGradeTurmaId.split('__');
    const turma = (this.state.classes || []).find(t => t.id === selectedTId);
    if (!turma) return;

    const currentType = this.getGradeCalcType(selectedTId, selectedTdId);
    if (newType === currentType) return;

    const selectEl = document.getElementById('notas-calc-type');
    const currentLabel = currentType === 'ponderada' ? 'Média Ponderada (por pesos)' : 'Média Aritmética (simples)';
    const newLabel = newType === 'ponderada' ? 'Média Ponderada (por pesos)' : 'Média Aritmética (simples)';

    const confirmed = await this.app.confirmDialog({
      title: 'Alterar Forma de Cálculo da Média',
      message: `Deseja realmente alterar a fórmula de cálculo de "${currentLabel}" para "${newLabel}" nesta disciplina? As médias finais de todos os alunos serão recalculadas automaticamente com base nesta regra.`,
      confirmText: 'Sim, Alterar',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (!confirmed) {
      if (selectEl) {
        selectEl.value = currentType;
      }
      return;
    }

    this.app.ensureTurmaDisciplines(turma);
    if (selectedTdId && turma.disciplines) {
      const td = turma.disciplines.find(d => d.id === selectedTdId);
      if (td) {
        td.tipoMedia = newType;
        if (Array.isArray(td.sharedWithTurmaIds)) {
          td.sharedWithTurmaIds.forEach(otherTId => {
            const otherT = (this.state.classes || []).find(t => t.id === otherTId);
            if (otherT && otherT.disciplines) {
              const matchTd = otherT.disciplines.find(d => d.disciplineId === td.disciplineId);
              if (matchTd) matchTd.tipoMedia = newType;
            }
          });
        }
      }
    } else {
      turma.tipoMedia = newType;
    }

    this.app.saveState();
    this.app.showToast(`Forma de cálculo alterada para: ${newLabel}`, 'success');
    this.renderGradesTable();
  }

  toggleCriterioCustomInputs(type) {
    if (type === 'course') {
      const val = document.getElementById('course-criterio-tipo')?.value;
      const box = document.getElementById('course-criterio-custom-box');
      if (box) box.style.display = val === 'personalizado' ? 'block' : 'none';
    } else if (type === 'disc') {
      const val = document.getElementById('disc-criterio-tipo')?.value;
      const box = document.getElementById('disc-criterio-custom-box');
      if (box) box.style.display = val === 'personalizado' ? 'block' : 'none';
    } else if (type === 'turma_grading') {
      const val = document.getElementById('turma-grading-tipo')?.value;
      const box = document.getElementById('turma-grading-custom-box');
      if (box) box.style.display = val === 'personalizado' ? 'block' : 'none';
    }
  }

  getGradingCriteria(turmaId, tdId) {
    const defaultCriteria = {
      notaAprovacao: 6.0,
      notaExame: 4.0,
      origem: 'Padrão do Sistema',
      nivel: 'sistema',
      isCustom: false
    };

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    let td = null;
    let discipline = null;
    let course = null;

    if (turma) {
      this.app.ensureTurmaDisciplines(turma);
      if (tdId && turma.disciplines) {
        td = turma.disciplines.find(d => d.id === tdId);
      }
      if (!td && turma.disciplines && turma.disciplines.length > 0) {
        td = turma.disciplines[0];
      }
      if (td && td.disciplineId) {
        discipline = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
      }
      if (turma.courseId) {
        course = (this.state.courses || []).find(c => c.id === turma.courseId);
      }
    }

    // 1. Nível Turma-Disciplina específica
    if (td && td.criterioAvaliacao && td.criterioAvaliacao.ativo) {
      const ap = parseFloat(td.criterioAvaliacao.notaAprovacao);
      const ex = parseFloat(td.criterioAvaliacao.notaExame);
      return {
        notaAprovacao: !isNaN(ap) ? ap : 6.0,
        notaExame: !isNaN(ex) ? ex : 4.0,
        origem: 'Personalizado nesta Turma',
        nivel: 'turma',
        isCustom: true
      };
    }

    // 2. Nível Disciplina (cadastro geral da matriz)
    if (discipline && discipline.criterioAvaliacao && discipline.criterioAvaliacao.ativo) {
      const ap = parseFloat(discipline.criterioAvaliacao.notaAprovacao);
      const ex = parseFloat(discipline.criterioAvaliacao.notaExame);
      return {
        notaAprovacao: !isNaN(ap) ? ap : 6.0,
        notaExame: !isNaN(ex) ? ex : 4.0,
        origem: `Disciplina (${discipline.name || discipline.nome})`,
        nivel: 'disciplina',
        isCustom: true
      };
    }

    // 3. Nível Curso
    if (course && course.criterioAvaliacao && course.criterioAvaliacao.ativo) {
      const ap = parseFloat(course.criterioAvaliacao.notaAprovacao);
      const ex = parseFloat(course.criterioAvaliacao.notaExame);
      return {
        notaAprovacao: !isNaN(ap) ? ap : 6.0,
        notaExame: !isNaN(ex) ? ex : 4.0,
        origem: `Curso (${course.name || course.nome})`,
        nivel: 'curso',
        isCustom: true
      };
    }

    // 4. Nível Instituição
    const school = this.app.getActiveSchool();
    if (school && school.criterioAvaliacao) {
      const ap = parseFloat(school.criterioAvaliacao.notaAprovacao);
      const ex = parseFloat(school.criterioAvaliacao.notaExame);
      return {
        notaAprovacao: !isNaN(ap) ? ap : 6.0,
        notaExame: !isNaN(ex) ? ex : 4.0,
        origem: 'Instituição (Padrão)',
        nivel: 'instituicao',
        isCustom: false
      };
    }

    return defaultCriteria;
  }

  getStudentGradeStatus(mediaVal, criteria) {
    if (mediaVal === '-' || mediaVal === null || mediaVal === undefined || mediaVal === '') {
      return {
        situacao: 'Pendente',
        badgeHtml: `<span class="badge badge-info">Pendente</span>`
      };
    }

    const num = parseFloat(mediaVal);
    if (isNaN(num)) {
      return {
        situacao: 'Pendente',
        badgeHtml: `<span class="badge badge-info">Pendente</span>`
      };
    }

    const ap = criteria && criteria.notaAprovacao !== undefined ? criteria.notaAprovacao : 6.0;
    const ex = criteria && criteria.notaExame !== undefined ? criteria.notaExame : 4.0;

    if (num >= ap) {
      return {
        situacao: 'Aprovado',
        badgeHtml: `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Aprovado</span>`
      };
    } else if (num >= ex) {
      return {
        situacao: 'Exame',
        badgeHtml: `<span class="badge badge-warning" style="background:#fef3c7; color:#d97706;"><i class="fa-solid fa-circle-exclamation"></i> Exame</span>`
      };
    } else {
      return {
        situacao: 'Reprovado',
        badgeHtml: `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Reprovado</span>`
      };
    }
  }

  openTurmaGradingScaleModal(turmaId, tdId) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'configurar critérios de aprovação')) return;

    const tId = turmaId || (this.app.selectedGradeTurmaId ? this.app.selectedGradeTurmaId.split('__')[0] : null);
    const dId = tdId || (this.app.selectedGradeTurmaId ? this.app.selectedGradeTurmaId.split('__')[1] : null);

    if (!tId) {
      this.app.showToast('Selecione uma turma antes de configurar os critérios.', 'warning');
      return;
    }

    const turma = (this.state.classes || []).find(t => t.id === tId);
    if (!turma) {
      this.app.showToast('Turma não encontrada.', 'error');
      return;
    }
    this.app.ensureTurmaDisciplines(turma);

    let td = null;
    let discName = 'Disciplina';
    if (dId && turma.disciplines) {
      td = turma.disciplines.find(d => d.id === dId);
      if (td) {
        const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
        if (disc) discName = disc.name || disc.nome || 'Disciplina';
      }
    }
    if (!td && turma.disciplines && turma.disciplines[0]) {
      td = turma.disciplines[0];
      const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
      if (disc) discName = disc.name || disc.nome || 'Disciplina';
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);

    const simulatedInheritedCriteria = (() => {
      const disc = td ? (this.state.disciplines || []).find(d => d.id === td.disciplineId) : null;
      if (disc && disc.criterioAvaliacao && disc.criterioAvaliacao.ativo) {
        return {
          ap: disc.criterioAvaliacao.notaAprovacao,
          ex: disc.criterioAvaliacao.notaExame,
          origem: `Disciplina (${disc.name || disc.nome})`
        };
      }
      if (course && course.criterioAvaliacao && course.criterioAvaliacao.ativo) {
        return {
          ap: course.criterioAvaliacao.notaAprovacao,
          ex: course.criterioAvaliacao.notaExame,
          origem: `Curso (${course.name || course.nome})`
        };
      }
      const school = this.app.getActiveSchool();
      if (school && school.criterioAvaliacao) {
        return {
          ap: school.criterioAvaliacao.notaAprovacao,
          ex: school.criterioAvaliacao.notaExame,
          origem: 'Instituição (Padrão Geral)'
        };
      }
      return { ap: 6.0, ex: 4.0, origem: 'Padrão do Sistema' };
    })();

    const displayEl = document.getElementById('turma-grading-display');
    if (displayEl) {
      displayEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div><strong style="color:var(--primary); font-size:1.05rem;"><i class="fa-solid fa-users"></i> ${this.app.escapeHTML(turma.nome)}</strong> • <span style="font-weight:600;">${this.app.escapeHTML(discName)}</span></div>
          <div style="font-size:0.82rem; color:var(--text-muted);">Curso: ${course ? this.app.escapeHTML(course.name) : '-'}</div>
        </div>
      `;
    }

    const infoEl = document.getElementById('turma-grading-inherited-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; color:var(--text-color); margin-bottom:2px;">
          <i class="fa-solid fa-sitemap" style="color:var(--primary);"></i> Regra Padrão Herdada:
        </div>
        <div>
          Origem: <strong>${simulatedInheritedCriteria.origem}</strong> | 
          Aprovado: <strong>&ge; ${Number(simulatedInheritedCriteria.ap).toFixed(1)}</strong> | 
          Exame: <strong>&ge; ${Number(simulatedInheritedCriteria.ex).toFixed(1)}</strong>
        </div>
      `;
    }

    const tInput = document.getElementById('turma-grading-turma-id');
    const tdInput = document.getElementById('turma-grading-td-id');
    if (tInput) tInput.value = tId;
    if (tdInput) tdInput.value = td ? td.id : (dId || '');

    const tipoSelect = document.getElementById('turma-grading-tipo');
    const customBox = document.getElementById('turma-grading-custom-box');
    const apInput = document.getElementById('turma-grading-nota-aprovacao');
    const exInput = document.getElementById('turma-grading-nota-exame');

    const isCustom = !!(td && td.criterioAvaliacao && td.criterioAvaliacao.ativo);
    if (tipoSelect) tipoSelect.value = isCustom ? 'personalizado' : 'padrao';
    if (customBox) customBox.style.display = isCustom ? 'block' : 'none';
    if (apInput) apInput.value = isCustom ? td.criterioAvaliacao.notaAprovacao : simulatedInheritedCriteria.ap;
    if (exInput) exInput.value = isCustom ? td.criterioAvaliacao.notaExame : simulatedInheritedCriteria.ex;

    document.getElementById('modal-turma-grading-scale')?.classList.add('open');
  }

  handleSaveTurmaGradingScale(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'salvar critérios de aprovação')) return;

    const tId = document.getElementById('turma-grading-turma-id')?.value;
    const tdId = document.getElementById('turma-grading-td-id')?.value;
    const turma = (this.state.classes || []).find(t => t.id === tId);
    if (!turma) {
      this.app.showToast('Turma não encontrada.', 'error');
      return;
    }
    this.app.ensureTurmaDisciplines(turma);

    const td = turma.disciplines ? turma.disciplines.find(d => d.id === tdId) : null;
    const tipo = document.getElementById('turma-grading-tipo')?.value;
    const apVal = parseFloat(document.getElementById('turma-grading-nota-aprovacao')?.value);
    const exVal = parseFloat(document.getElementById('turma-grading-nota-exame')?.value);

    const criterioObj = tipo === 'personalizado' ? {
      ativo: true,
      notaAprovacao: !isNaN(apVal) ? apVal : 6.0,
      notaExame: !isNaN(exVal) ? exVal : 4.0
    } : { ativo: false };

    if (td) {
      td.criterioAvaliacao = criterioObj;
      if (Array.isArray(td.sharedWithTurmaIds)) {
        td.sharedWithTurmaIds.forEach(otherTId => {
          const otherT = (this.state.classes || []).find(t => t.id === otherTId);
          if (otherT && otherT.disciplines) {
            const matchTd = otherT.disciplines.find(d => d.disciplineId === td.disciplineId);
            if (matchTd) matchTd.criterioAvaliacao = criterioObj;
          }
        });
      }
    } else {
      turma.criterioAvaliacao = criterioObj;
    }

    this.app.saveState();
    this.app.closeModal('modal-turma-grading-scale');
    this.app.showToast('Critérios de aprovação da turma atualizados com sucesso!', 'success');
    this.renderGradesTable();
    if (document.getElementById('modal-turma-disciplines')?.classList.contains('open')) {
      this.app.renderTurmaDisciplinesLists(turma);
    }
  }

  openEvaluationModal() {
    if (!this.app.checkPermission(['gestao', 'professor'], 'criar instrumento de avaliação')) return;

    if (!this.app.selectedGradeTurmaId) {
      this.app.showToast('Selecione uma turma/disciplina antes de cadastrar uma avaliação.', 'warning');
      return;
    }

    const [selectedTId, selectedTdId] = this.app.selectedGradeTurmaId.split('__');
    const turma = (this.state.classes || []).find(t => t.id === selectedTId);
    if (!turma) {
      this.app.showToast('Turma não encontrada.', 'warning');
      return;
    }

    this.app.ensureTurmaDisciplines(turma);

    let discName = 'Disciplina';
    let discCode = '';
    let isShared = false;

    if (selectedTdId && turma.disciplines) {
      const td = turma.disciplines.find(d => d.id === selectedTdId);
      if (td) {
        const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
        if (disc) {
          discName = disc.name || disc.nome || 'Disciplina';
          discCode = disc.code || disc.codigo || '';
        }
        isShared = Array.isArray(td.sharedWithTurmaIds) && td.sharedWithTurmaIds.length > 0;
      }
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const courseName = course ? course.name : '';
    const calcType = this.getGradeCalcType(selectedTId, selectedTdId);

    const hiddenInput = document.getElementById('eval-turma');
    if (hiddenInput) {
      hiddenInput.value = this.app.selectedGradeTurmaId;
    }

    const displayEl = document.getElementById('eval-turma-display');
    if (displayEl) {
      displayEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 1.05rem; font-weight: 700; color: var(--text-color);">
              <i class="fa-solid fa-users" style="color: var(--primary); margin-right: 4px;"></i> ${this.app.escapeHTML(turma.nome)}
            </span>
            ${courseName ? `<span class="badge" style="background: rgba(0,0,0,0.06); color: var(--text-muted); font-size: 0.75rem;">${this.app.escapeHTML(courseName)}</span>` : ''}
            ${isShared ? `<span class="badge" style="background: rgba(99,102,241,0.12); color: #6366f1; font-size: 0.72rem;"><i class="fa-solid fa-people-arrows"></i> Aula Conjunta</span>` : ''}
            <span class="badge" style="background: ${calcType === 'ponderada' ? 'rgba(79,70,229,0.12)' : 'rgba(16,185,129,0.12)'}; color: ${calcType === 'ponderada' ? 'var(--primary)' : 'var(--success)'}; font-size: 0.72rem;">
              <i class="fa-solid fa-calculator"></i> ${calcType === 'ponderada' ? 'Média Ponderada' : 'Média Aritmética'}
            </span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: normal;">
            Disciplina: <strong style="color: var(--primary);">${this.app.escapeHTML(discName)}</strong> ${discCode ? `<span style="font-size: 0.76rem; background: var(--bg-surface-secondary); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); margin-left: 4px;">${this.app.escapeHTML(discCode)}</span>` : ''}
          </div>
        </div>
      `;
    }

    const titleInput = document.getElementById('eval-titulo');
    if (titleInput) titleInput.value = '';
    const weightInput = document.getElementById('eval-peso');
    if (weightInput) weightInput.value = '1.0';

    const pesoLabel = document.getElementById('eval-peso-label');
    const pesoHint = document.getElementById('eval-peso-hint');
    const pesoGroup = document.getElementById('eval-peso-group');

    if (pesoLabel && pesoHint) {
      if (calcType === 'ponderada') {
        pesoLabel.innerHTML = `Peso da Avaliação (Ponderada) *`;
        pesoHint.innerHTML = `<span style="color:var(--primary); font-weight:600;"><i class="fa-solid fa-scale-balanced"></i> Média Ponderada ativa</span>: Informe o multiplicador da nota (ex: 0.6 e 0.4, ou 1 e 2).`;
        if (pesoGroup) pesoGroup.style.opacity = '1';
      } else {
        pesoLabel.innerHTML = `Peso da Avaliação`;
        pesoHint.innerHTML = `<span style="color:var(--text-muted);"><i class="fa-solid fa-calculator"></i> Média Aritmética ativa</span>: Nesta turma a média final é simples ((N1 + N2 + ...)/K). O peso é mantido em 1.0.`;
        if (pesoGroup) pesoGroup.style.opacity = '0.75';
      }
    }

    document.getElementById('modal-evaluation')?.classList.add('open');
  }

  handleSaveEvaluation(e) {
    e.preventDefault();
    const rawTurmaId = document.getElementById('eval-turma')?.value;
    const title = document.getElementById('eval-titulo')?.value.trim();
    const weight = parseFloat(document.getElementById('eval-peso')?.value) || 1.0;

    if (!rawTurmaId) {
      this.app.showToast('Selecione uma turma/disciplina válida.', 'warning');
      return;
    }

    const [selectedTId, selectedTdId] = rawTurmaId.split('__');
    const turma = (this.state.classes || []).find(t => t.id === selectedTId);
    let disciplineId = null;
    if (turma && turma.disciplines && selectedTdId) {
      const td = turma.disciplines.find(d => d.id === selectedTdId);
      if (td) disciplineId = td.disciplineId;
    }

    if (!this.state.evaluations) this.state.evaluations = [];

    const newEval = {
      id: 'eval_' + Date.now(),
      turmaId: selectedTId,
      turmaDisciplinaId: selectedTdId || null,
      disciplineId: disciplineId || null,
      rawTurmaId: rawTurmaId,
      title,
      weight,
      criadoEm: new Date().toISOString()
    };

    this.state.evaluations.push(newEval);
    this.app.saveState();
    this.app.closeModal('modal-evaluation');
    this.app.showToast(`Avaliação "${title}" criada com sucesso!`, 'success');

    this.app.selectedGradeTurmaId = rawTurmaId;
    if (turma) this.app.selectedGradeCourseId = turma.courseId;

    this.renderGradesTable();
  }

  async deleteEvaluation(evalId) {
    const confirmed = await this.app.confirmAction({
      title: 'Excluir Avaliação',
      message: 'Tem certeza que deseja excluir esta avaliação? As notas associadas a ela serão removidas.',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.evaluations = (this.state.evaluations || []).filter(ev => ev.id !== evalId);
      if (this.state.studentGrades) {
        Object.keys(this.state.studentGrades).forEach(k => {
          if (k.startsWith(`${evalId}_`)) {
            delete this.state.studentGrades[k];
          }
        });
      }
      this.app.saveState();
      this.app.showToast('Avaliação excluída com sucesso.', 'success');
      this.renderGradesTable();
    }
  }

  calculateLiveGradeRow(inputEl, studentId) {
    if (!this.app.selectedGradeTurmaId) return;
    const [selectedTId, selectedTdId] = this.app.selectedGradeTurmaId.split('__');
    const calcType = this.getGradeCalcType(selectedTId, selectedTdId);
    const turmaEvals = this.getEvaluationsForTurmaDiscipline(selectedTId, selectedTdId);

    let weightedSum = 0;
    let totalWeight = 0;
    let simpleSum = 0;
    let gradeCount = 0;

    turmaEvals.forEach(ev => {
      const el = document.getElementById(`grade_${ev.id}_${studentId}`);
      if (el && el.value.trim() !== '') {
        const rawVal = el.value.trim().replace(',', '.');
        const val = parseFloat(rawVal);
        if (!isNaN(val)) {
          simpleSum += val;
          gradeCount++;
          weightedSum += val * (ev.weight || 1.0);
          totalWeight += (ev.weight || 1.0);
        }
      }
    });

    const mediaEl = document.getElementById(`media_${studentId}`);
    const situacaoEl = document.getElementById(`situacao_${studentId}`);

    if (mediaEl && situacaoEl) {
      if (gradeCount === 0) {
        mediaEl.textContent = '-';
        situacaoEl.innerHTML = `<span class="badge badge-info">Pendente</span>`;
      } else {
        const media = (calcType === 'ponderada' && totalWeight > 0)
          ? (weightedSum / totalWeight).toFixed(1)
          : (simpleSum / gradeCount).toFixed(1);

        mediaEl.textContent = media;
        const criteria = this.getGradingCriteria(selectedTId, selectedTdId);
        const statusObj = this.getStudentGradeStatus(media, criteria);
        situacaoEl.innerHTML = statusObj.badgeHtml;
      }
    }
  }

  handleGradeInputKey(e, inputEl) {
    const rowIdx = parseInt(inputEl.dataset.rowIdx, 10);
    const evalId = inputEl.dataset.evalId;

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextInput = document.querySelector(`input[data-eval-id="${evalId}"][data-row-idx="${rowIdx + 1}"]`);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.querySelector(`input[data-eval-id="${evalId}"][data-row-idx="${rowIdx - 1}"]`);
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    }
  }

  handleGradeInputBlur(inputEl, evalId, studentId) {
    if (!inputEl) return;
    const rawVal = inputEl.value.trim();
    if (!this.state.studentGrades) this.state.studentGrades = {};

    if (rawVal !== '') {
      let val = parseFloat(rawVal.replace(',', '.'));
      if (isNaN(val)) val = 0;
      if (val < 0) val = 0;
      if (val > 10) val = 10;
      this.state.studentGrades[`${evalId}_${studentId}`] = val;
    } else {
      delete this.state.studentGrades[`${evalId}_${studentId}`];
    }

    this.app.saveStateLocally();
    inputEl.classList.add('grade-saved-pulse');
    setTimeout(() => inputEl.classList.remove('grade-saved-pulse'), 1200);
  }

  saveStudentGrade(rawTurmaId, studentId) {
    if (!this.app.checkPermission(['gestao', 'professor'], 'lançar notas')) return;
    const [selectedTId, selectedTdId] = (rawTurmaId || this.app.selectedGradeTurmaId || '').split('__');
    const turmaEvals = this.getEvaluationsForTurmaDiscipline(selectedTId, selectedTdId);

    if (!this.state.studentGrades) this.state.studentGrades = {};

    turmaEvals.forEach(ev => {
      const inputEl = document.getElementById(`grade_${ev.id}_${studentId}`);
      if (inputEl) {
        const rawVal = inputEl.value.trim();
        if (rawVal !== '') {
          let val = parseFloat(rawVal.replace(',', '.'));
          if (isNaN(val)) val = 0;
          if (val < 0) val = 0;
          if (val > 10) val = 10;
          this.state.studentGrades[`${ev.id}_${studentId}`] = val;
        }
      }
    });

    this.app.saveState();
    this.app.showToast('Notas do aluno salvas com sucesso!', 'success');
    this.renderGradesTable();
  }

  saveAllStudentGrades() {
    if (!this.app.checkPermission(['gestao', 'professor'], 'lançar notas')) return;
    if (!this.app.selectedGradeTurmaId) {
      this.app.showToast('Nenhuma turma selecionada.', 'warning');
      return;
    }

    const [selectedTId, selectedTdId] = (this.app.selectedGradeTurmaId || '').split('__');
    const enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(selectedTId, selectedTdId);
    const turmaEvals = this.getEvaluationsForTurmaDiscipline(selectedTId, selectedTdId);

    if (turmaEvals.length === 0) {
      this.app.showToast('Cadastre ao menos uma avaliação antes de salvar notas.', 'warning');
      return;
    }

    if (!this.state.studentGrades) this.state.studentGrades = {};

    let savedCount = 0;
    enrolledStudents.forEach(aluno => {
      turmaEvals.forEach(ev => {
        const inputEl = document.getElementById(`grade_${ev.id}_${aluno.id}`);
        if (inputEl) {
          const rawVal = inputEl.value.trim();
          if (rawVal !== '') {
            let val = parseFloat(rawVal.replace(',', '.'));
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > 10) val = 10;
            this.state.studentGrades[`${ev.id}_${aluno.id}`] = val;
            savedCount++;
          }
        }
      });
    });

    this.app.saveState();
    this.app.showToast(`Todas as notas da turma foram salvas com sucesso! (${savedCount} lançamentos)`, 'success');
    this.renderGradesTable();
  }

  renderGradesTable() {
    const thead = document.getElementById('table-notas-thead');
    const tbody = document.getElementById('table-notas-body');
    const chipsContainer = document.getElementById('evaluations-chips-container');
    const courseSelect = document.getElementById('notas-filter-curso');
    const turmaSelect = document.getElementById('notas-filter-turma');
    const titleEl = document.getElementById('notas-selected-turma-title');
    const subtitleEl = document.getElementById('notas-selected-turma-subtitle');
    const badgeEl = document.getElementById('notas-role-context-badge');
    const calcSelect = document.getElementById('notas-calc-type');

    if (!tbody || !thead) return;

    if (!this.state.evaluations) this.state.evaluations = [];
    if (!this.state.studentGrades) this.state.studentGrades = {};

    if (badgeEl) {
      if (this.app.currentRole === 'professor') {
        badgeEl.innerHTML = `<i class="fa-solid fa-chalkboard-user"></i> Lançamento Docente`;
      } else if (this.app.currentRole === 'aluno') {
        badgeEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Meu Boletim de Notas`;
      } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-school"></i> Gestão de Notas`;
      }
    }

    const { relevantTurmas, availableCourses } = this.app.getTeacherAvailableCoursesAndClasses();

    // 1. Preencher Cursos disponíveis
    if (courseSelect) {
      if (availableCourses.length === 0) {
        courseSelect.innerHTML = `<option value="">Nenhum curso disponível</option>`;
        if (turmaSelect) turmaSelect.innerHTML = `<option value="">Nenhuma turma disponível</option>`;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum curso ou turma vinculado a este perfil.</td></tr>`;
        thead.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Lançamento de Notas';
        if (subtitleEl) subtitleEl.textContent = 'Sem turmas disponíveis';
        return;
      }

      courseSelect.innerHTML = availableCourses.map(c => 
        `<option value="${c.id}">${this.app.escapeHTML(c.code ? c.code + ' - ' : '')}${this.app.escapeHTML(c.name)}</option>`
      ).join('');

      if (!this.app.selectedGradeCourseId || !availableCourses.some(c => c.id === this.app.selectedGradeCourseId)) {
        this.app.selectedGradeCourseId = availableCourses[0].id;
      }
      courseSelect.value = this.app.selectedGradeCourseId;
    }

    // 2. Preencher Turmas do curso selecionado
    const courseTurmas = relevantTurmas.filter(t => t.courseId === this.app.selectedGradeCourseId);

    if (turmaSelect) {
      if (courseTurmas.length === 0) {
        turmaSelect.innerHTML = `<option value="">Nenhuma turma encontrada para este curso</option>`;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhuma turma encontrada para o curso selecionado.</td></tr>`;
        thead.innerHTML = '';
        if (titleEl) titleEl.textContent = 'Lançamento de Notas';
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
          turmaOptionsHTML += `<option value="${val}">${this.app.escapeHTML(t.nome)} (Sem disciplinas)</option>`;
        } else {
          activeDiscs.forEach(td => {
            const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
            const discName = disc ? (disc.name || disc.nome || 'Disciplina') : 'Disciplina';
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

      if (!this.app.selectedGradeTurmaId || !validTurmaValues.includes(this.app.selectedGradeTurmaId)) {
        this.app.selectedGradeTurmaId = validTurmaValues[0] || null;
      }
      turmaSelect.value = this.app.selectedGradeTurmaId || '';
    }

    // 3. Obter dados da turma e disciplina selecionadas para os títulos
    const [selectedTId, selectedTdId] = (this.app.selectedGradeTurmaId || '').split('__');
    const selectedTurma = (this.state.classes || []).find(t => t.id === selectedTId);
    let selectedDiscName = '';
    let selectedDiscCode = '';
    if (selectedTurma) {
      if (selectedTdId && selectedTurma.disciplines) {
        const td = selectedTurma.disciplines.find(d => d.id === selectedTdId);
        if (td) {
          const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
          if (disc) {
            selectedDiscName = disc.name || disc.nome || 'Disciplina';
            selectedDiscCode = disc.code || disc.codigo || '';
          }
        }
      }
      if (!selectedDiscName && selectedTurma.disciplines && selectedTurma.disciplines[0]) {
        const td = selectedTurma.disciplines[0];
        const disc = (this.state.disciplines || []).find(d => d.id === td.disciplineId);
        if (disc) {
          selectedDiscName = disc.name || disc.nome || '';
          selectedDiscCode = disc.code || disc.codigo || '';
        }
      }
    }

    const calcType = this.getGradeCalcType(selectedTId, selectedTdId);
    if (calcSelect) {
      calcSelect.value = calcType;
    }

    if (titleEl) {
      if (selectedTurma) {
        titleEl.innerHTML = `<i class="fa-solid fa-award" style="color:var(--primary);"></i> ${this.app.escapeHTML(selectedTurma.nome)} ${selectedDiscName ? `• <span style="font-weight:600; color:var(--text-color);">${this.app.escapeHTML(selectedDiscName)}</span>` : ''}`;
      } else {
        titleEl.innerHTML = `<i class="fa-solid fa-award"></i> Lançamento de Notas & Médias`;
      }
    }

    const criteria = this.getGradingCriteria(selectedTId, selectedTdId);

    if (subtitleEl) {
      if (selectedTurma) {
        const course = (this.state.courses || []).find(c => c.id === selectedTurma.courseId);
        const calcBadge = `<span class="badge" style="background:${calcType === 'ponderada' ? 'rgba(79,70,229,0.1)' : 'rgba(16,185,129,0.1)'}; color:${calcType === 'ponderada' ? 'var(--primary)' : 'var(--success)'}; font-size:0.75rem; margin-left:6px;"><i class="fa-solid fa-calculator"></i> ${calcType === 'ponderada' ? 'Média Ponderada' : 'Média Aritmética'}</span>`;
        const canEditCrit = (this.app.currentRole === 'gestao' || this.app.currentRole === 'secretaria');
        const critTitle = canEditCrit 
          ? `Critério ativo: Aprovado ≥ ${criteria.notaAprovacao.toFixed(1)}, Exame ≥ ${criteria.notaExame.toFixed(1)} (${criteria.origem}) - Clique para editar`
          : `Critério da Instituição/Gestão: Aprovado ≥ ${criteria.notaAprovacao.toFixed(1)}, Exame ≥ ${criteria.notaExame.toFixed(1)} (${criteria.origem})`;
        const critBadge = `<span class="badge" style="background:rgba(99,102,241,0.09); color:var(--primary); font-size:0.75rem; margin-left:6px; ${canEditCrit ? 'cursor:pointer;' : 'cursor:default;'}" ${canEditCrit ? 'onclick="app.openTurmaGradingScaleModal()"' : ''} title="${critTitle}"><i class="fa-solid fa-scale-balanced"></i> Aprovado &ge; ${criteria.notaAprovacao.toFixed(1)} | Exame &ge; ${criteria.notaExame.toFixed(1)} <small style="opacity:0.8;">(${criteria.origem})</small></span>`;
        subtitleEl.innerHTML = `Curso: <strong>${course ? this.app.escapeHTML(course.name) : '-'}</strong> ${selectedDiscCode ? `| Código: <strong>${this.app.escapeHTML(selectedDiscCode)}</strong>` : ''} ${calcBadge} ${critBadge}`;
      } else {
        subtitleEl.textContent = 'Carregando informações da turma selecionada...';
      }
    }

    const turmaEvals = this.getEvaluationsForTurmaDiscipline(selectedTId, selectedTdId);

    if (chipsContainer) {
      if (turmaEvals.length === 0) {
        chipsContainer.innerHTML = `
          <div style="font-size:0.82rem; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-circle-info" style="color:var(--primary);"></i>
            <span>Nenhuma avaliação cadastrada para esta turma/disciplina. Clique em <strong>Criar Nova Avaliação</strong> acima para adicionar provas ou trabalhos.</span>
          </div>
        `;
      } else {
        chipsContainer.innerHTML = turmaEvals.map(ev => `
          <div style="background:var(--primary-light); border:1px solid var(--primary-border); padding:0.35rem 0.8rem; border-radius:30px; font-size:0.8rem; display:inline-flex; align-items:center; gap:0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <strong style="color:var(--primary);"><i class="fa-solid fa-file-pen" style="margin-right:4px;"></i>${this.app.escapeHTML(ev.title)}</strong>
            ${calcType === 'ponderada' ? `<span style="font-size:0.72rem; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:12px; color:var(--text-muted);">Peso ${ev.weight || 1.0}</span>` : ''}
            <button type="button" class="role-access-professor" style="border:none; background:none; cursor:pointer; color:var(--danger); font-size:0.85rem; padding:0 2px;" onclick="app.deleteEvaluation('${ev.id}')" title="Excluir Avaliação">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        `).join('');
      }
    }

    const isTeacherOrAdmin = (this.app.currentRole === 'professor' || this.app.currentRole === 'gestao' || this.app.currentRole === 'secretaria');
    let headerHtml = `
      <tr>
        <th style="width: 100px;">RA</th>
        <th>Nome do Aluno</th>
    `;
    turmaEvals.forEach(ev => {
      const pesoDisplay = calcType === 'ponderada' 
        ? `<br><small style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">Peso ${ev.weight || 1.0}</small>`
        : '';
      headerHtml += `<th style="text-align:center; min-width: 110px;">${this.app.escapeHTML(ev.title)}${pesoDisplay}</th>`;
    });
    headerHtml += `
        <th style="text-align:center; width: 130px;">Média Final<br><small style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">(${calcType === 'ponderada' ? 'Ponderada' : 'Aritmética'})</small></th>
        <th style="text-align:center; width: 120px;">Situação</th>
        ${isTeacherOrAdmin ? '<th style="text-align:center; width: 100px;">Ação</th>' : ''}
      </tr>
    `;
    thead.innerHTML = headerHtml;

    if (!selectedTurma) {
      tbody.innerHTML = `<tr><td colspan="${4 + turmaEvals.length}" style="text-align:center; padding:2rem;">Turma não encontrada.</td></tr>`;
      return;
    }

    let enrolledStudents = this.app.getEnrolledStudentsForTurmaDiscipline(selectedTId, selectedTdId);

    if (this.app.currentRole === 'aluno' && this.app.currentUser) {
      enrolledStudents = enrolledStudents.filter(st => st.id === this.app.currentUser.id);
    }

    if (enrolledStudents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${4 + turmaEvals.length}" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum aluno matriculado nesta disciplina.</td></tr>`;
      return;
    }

    tbody.innerHTML = enrolledStudents.map((aluno, studentIdx) => {
      const stId = aluno.id;
      let weightedSum = 0;
      let totalWeight = 0;
      let simpleSum = 0;
      let gradeCount = 0;

      let evalInputsHtml = turmaEvals.map(ev => {
        const gradeKey = `${ev.id}_${stId}`;
        const val = (this.state.studentGrades && this.state.studentGrades[gradeKey] !== undefined) ? this.state.studentGrades[gradeKey] : '';
        const numVal = parseFloat(val);

        if (val !== '' && !isNaN(numVal)) {
          simpleSum += numVal;
          gradeCount++;
          weightedSum += numVal * (ev.weight || 1.0);
          totalWeight += (ev.weight || 1.0);
        }

        if (isTeacherOrAdmin) {
          return `
            <td style="text-align:center;">
              <input type="number" step="0.1" max="10" min="0" class="form-control form-control-sm grade-spreadsheet-input" 
                style="width:75px; text-align:center; margin:0 auto; font-weight:600;" 
                value="${val}" id="grade_${ev.id}_${stId}" placeholder="0.0"
                data-eval-id="${ev.id}" data-student-id="${stId}" data-row-idx="${studentIdx}"
                oninput="app.calculateLiveGradeRow(this, '${stId}')"
                onkeydown="app.gradeModule.handleGradeInputKey(event, this)"
                onblur="app.gradeModule.handleGradeInputBlur(this, '${ev.id}', '${stId}')">
            </td>
          `;
        } else {
          return `
            <td style="text-align:center; font-weight:700; color:${val !== '' ? 'var(--primary)' : 'var(--text-muted)'};">
              ${val !== '' ? Number(numVal).toFixed(1) : '-'}
            </td>
          `;
        }
      }).join('');

      let media = '-';
      if (gradeCount > 0) {
        if (calcType === 'ponderada' && totalWeight > 0) {
          media = (weightedSum / totalWeight).toFixed(1);
        } else {
          media = (simpleSum / gradeCount).toFixed(1);
        }
      }

      const statusObj = this.getStudentGradeStatus(media, criteria);
      const badgeHtml = statusObj.badgeHtml;

      const turmaBadge = aluno.isJoint 
        ? `<span class="badge" style="background:rgba(99,102,241,0.12); color:#6366f1; font-size:0.72rem; margin-left:6px;"><i class="fa-solid fa-people-arrows"></i> ${this.app.escapeHTML(aluno.originTurmaNome)}</span>`
        : '';

      return `
        <tr>
          <td><span class="ra-badge">${aluno.ra || '-'}</span></td>
          <td>
            <strong style="color:var(--text-color);">${this.app.escapeHTML(aluno.nome)}</strong>
            ${turmaBadge}
          </td>
          ${evalInputsHtml}
          <td style="text-align:center;"><strong id="media_${stId}" style="color:var(--primary); font-size:1.1rem;">${media}</strong></td>
          <td style="text-align:center;" id="situacao_${stId}">${badgeHtml}</td>
          ${isTeacherOrAdmin ? `
            <td style="text-align:center;">
              <button type="button" class="btn btn-primary btn-sm" onclick="app.saveStudentGrade('${this.app.selectedGradeTurmaId}', '${stId}')" title="Salvar notas deste aluno">
                <i class="fa-solid fa-floppy-disk"></i> Salvar
              </button>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');
  }
}
