/**
 * Portal do Curso - Student Module (Área Meu Curso, Disciplinas, Notas e Frequência)
 */

export class StudentModule {
  constructor(app) {
    this.app = app;
  }

  renderMeuCurso() {
    const container = document.getElementById('student-course-container');
    if (!container) return;

    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    // Localizar aluno ativo (usuário logado ou o primeiro aluno da escola)
    const student = (this.app.currentUser && this.app.currentUser.tipo === 'aluno')
      ? this.app.currentUser
      : (this.app.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.app.state.users.find(u => u.tipo === 'aluno'));

    if (!student) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <i class="fa-solid fa-user-graduate" style="font-size: 3rem; opacity: 0.4; margin-bottom: 1rem;"></i>
          <h3>Nenhum perfil de aluno ativo no momento</h3>
          <p>Selecione um usuário aluno ou acesse com uma conta de estudante para visualizar as disciplinas do curso.</p>
        </div>
      `;
      return;
    }

    // Localizar curso do aluno
    let studentCourse = this.app.state.courses.find(c => c.id === student.cursoId);
    
    // Turmas em que o aluno está enturmado
    const studentTurmas = (this.app.state.classes || []).filter(t => {
      if (t.schoolId !== schoolId && !student.schoolId) return false;
      return t.studentIds && Array.isArray(t.studentIds) && t.studentIds.includes(student.id);
    });

    if (!studentCourse && studentTurmas.length > 0) {
      studentCourse = this.app.state.courses.find(c => c.id === studentTurmas[0].courseId);
    }
    if (!studentCourse) {
      studentCourse = this.app.state.courses[0] || { name: 'Curso de Graduação / Técnico', code: 'CURSO', workload: 2400 };
    }

    // Avisos institucionais direcionados ao estudante
    const studentNotices = (this.app.state.notices || []).filter(n => {
      if (n.schoolId && schoolId && n.schoolId !== schoolId) return false;
      if (n.target === 'professores') return false;
      return true;
    }).slice(0, 3);

    // Coletar disciplinas do aluno através das turmas matriculadas
    const studentDisciplines = [];
    const addedDiscIds = new Set();

    studentTurmas.forEach(t => {
      this.app.ensureTurmaDisciplines(t);
      (t.disciplines || []).forEach(td => {
        if (td.disciplineId && !addedDiscIds.has(td.disciplineId) && td.status !== 'arquivada') {
          const disc = (this.app.state.disciplines || []).find(d => d.id === td.disciplineId);
          if (disc) {
            addedDiscIds.add(disc.id);
            studentDisciplines.push({
              turma: t,
              td: td,
              discipline: disc,
              teacher: (this.app.state.users || []).find(u => u.id === td.teacherId) || null
            });
          }
        }
      });
    });

    // Se o aluno não tiver turmas ainda, listar as disciplinas do seu curso
    if (studentDisciplines.length === 0 && studentCourse) {
      (this.app.state.disciplines || []).filter(d => d.courseId === studentCourse.id).forEach(disc => {
        studentDisciplines.push({
          turma: null,
          td: null,
          discipline: disc,
          teacher: null
        });
      });
    }

    // Calcular métricas globais do aluno
    let totalLessonsCount = 0;
    let totalPresencasCount = 0;
    let sumGrades = 0;
    let countGrades = 0;

    studentDisciplines.forEach(item => {
      const disc = item.discipline;
      const turma = item.turma;
      
      // Aulas desta disciplina
      const lessons = (this.app.state.lessons || []).filter(l => {
        if (item.td && l.turmaDisciplinaId === item.td.id) return true;
        if (turma && l.turmaId === turma.id) return true;
        return false;
      });

      lessons.forEach(l => {
        totalLessonsCount++;
        const att = this.app.state.attendance ? this.app.state.attendance[l.id] : null;
        if (att && att[student.id]) {
          if (att[student.id] === 'Presente' || att[student.id] === 'Justificado') totalPresencasCount++;
        } else {
          totalPresencasCount++;
        }
      });

      // Avaliações desta disciplina
      const evals = (this.app.state.evaluations || []).filter(ev => {
        if (item.td && ev.turmaDisciplinaId === item.td.id) return true;
        if (ev.disciplineId === disc.id) return true;
        if (turma && ev.turmaId === turma.id) return true;
        return false;
      });

      evals.forEach(ev => {
        const gradeKey = `${ev.id}_${student.id}`;
        if (this.app.state.studentGrades && this.app.state.studentGrades[gradeKey] !== undefined) {
          sumGrades += parseFloat(this.app.state.studentGrades[gradeKey]);
          countGrades++;
        }
      });
    });

    const globalFreqPct = totalLessonsCount > 0 ? Math.round((totalPresencasCount / totalLessonsCount) * 100) : 100;
    const globalAverage = countGrades > 0 ? (sumGrades / countGrades).toFixed(1) : '-';

    // -------------------------------------------------------------------------
    // CASO 1: DISCIPLINA SELECIONADA (VISUALIZAÇÃO DETALHADA)
    // -------------------------------------------------------------------------
    if (this.app.selectedStudentDisciplineId) {
      const selectedItem = studentDisciplines.find(item => item.discipline.id === this.app.selectedStudentDisciplineId) 
        || { discipline: this.app.state.disciplines.find(d => d.id === this.app.selectedStudentDisciplineId) || { name: 'Disciplina', code: 'DISC' }, turma: null, td: null, teacher: null };
      
      const disc = selectedItem.discipline;
      const turma = selectedItem.turma;
      const td = selectedItem.td;
      const teacher = selectedItem.teacher;

      // 1. Aulas da disciplina
      const discLessons = (this.app.state.lessons || []).filter(l => {
        if (td && l.turmaDisciplinaId === td.id) return true;
        if (turma && l.turmaId === turma.id) return true;
        return false;
      }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

      let presencas = 0;
      let faltas = 0;
      discLessons.forEach(l => {
        const att = this.app.state.attendance ? this.app.state.attendance[l.id] : null;
        if (att && att[student.id]) {
          if (att[student.id] === 'Presente' || att[student.id] === 'Justificado') presencas++;
          else if (att[student.id] === 'Ausente') faltas++;
        } else {
          presencas++;
        }
      });
      const discFreqPct = discLessons.length > 0 ? Math.round((presencas / discLessons.length) * 100) : 100;
      const isRiscoFreq = discFreqPct < 75;

      // 2. Avaliações e notas da disciplina
      const discEvals = (this.app.state.evaluations || []).filter(ev => {
        if (td && ev.turmaDisciplinaId === td.id) return true;
        if (ev.disciplineId === disc.id) return true;
        if (turma && ev.turmaId === turma.id) return true;
        return false;
      });

      let sumWeights = 0;
      let sumWeightedGrades = 0;
      let gradesList = [];

      discEvals.forEach(ev => {
        const gradeKey = `${ev.id}_${student.id}`;
        const hasGrade = this.app.state.studentGrades && this.app.state.studentGrades[gradeKey] !== undefined;
        const gradeVal = hasGrade ? parseFloat(this.app.state.studentGrades[gradeKey]) : null;
        const weight = parseFloat(ev.weight) || 1.0;

        if (gradeVal !== null) {
          sumWeights += weight;
          sumWeightedGrades += gradeVal * weight;
        }

        gradesList.push({
          evaluation: ev,
          grade: gradeVal,
          weight: weight
        });
      });

      const mediaFinal = sumWeights > 0 ? (sumWeightedGrades / sumWeights).toFixed(1) : null;
      const schoolCriteria = (activeSchool && activeSchool.criterioAvaliacao) ? activeSchool.criterioAvaliacao : { notaAprovacao: 6.0, notaExame: 4.0 };
      const notaCorte = parseFloat(schoolCriteria.notaAprovacao) || 6.0;
      const notaExame = parseFloat(schoolCriteria.notaExame) || 4.0;

      let statusNota = 'Em Andamento';
      let badgeClass = 'warning';
      if (mediaFinal !== null) {
        const numMedia = parseFloat(mediaFinal);
        if (numMedia >= notaCorte) {
          statusNota = 'Aprovado por Nota';
          badgeClass = 'approved';
        } else if (numMedia >= notaExame) {
          statusNota = 'Em Recuperação / Exame';
          badgeClass = 'warning';
        } else {
          statusNota = 'Abaixo da Média';
          badgeClass = 'danger';
        }
      }

      // 3. Bibliografia da disciplina
      const biblios = (this.app.state.bibliographies || []).filter(b => b.disciplineId === disc.id);
      const activeSection = this.app.studentDiscActiveSection || null;

      container.innerHTML = `
        <div class="student-disc-detail-view">
          <!-- Cabeçalho de Navegação e Título da Disciplina -->
          <div class="student-disc-detail-header">
            <div class="student-disc-detail-title-group">
              <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.backToStudentDisciplines()" title="Voltar para a lista de disciplinas" style="display:flex; align-items:center; gap:6px; font-weight:700;">
                  <i class="fa-solid fa-arrow-left"></i> Voltar para disciplinas
                </button>
                <button type="button" class="btn btn-primary btn-sm" onclick="app.academicReportsModule.generateBoletim('${student.id}')" title="Emitir Boletim Escolar Oficial Completo em PDF" style="display:flex; align-items:center; gap:6px; font-weight:700;">
                  <i class="fa-solid fa-file-pdf"></i> Emitir Boletim Oficial (PDF)
                </button>
              </div>
              <div>
                <span class="student-disc-code-badge">${this.app.escapeHTML(disc.code || 'DISC')}</span>
                <h2 style="margin: 4px 0; font-family: var(--font-heading); font-size: 1.4rem; color: var(--text-main);">${this.app.escapeHTML(disc.name)}</h2>
                <div style="font-size: 0.85rem; color: var(--text-muted); display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                  <span><i class="fa-solid fa-chalkboard-user" style="color:var(--primary);"></i> ${teacher ? this.app.escapeHTML(teacher.nome) : 'Professor a definir'}</span>
                  <span>•</span>
                  <span><i class="fa-solid fa-clock" style="color:var(--accent);"></i> ${disc.workload || 60}h (${Math.round((disc.workload || 60)/15)} aulas semanais)</span>
                  ${turma ? `<span>•</span><span><i class="fa-solid fa-users" style="color:var(--info);"></i> ${this.app.escapeHTML(turma.nome)}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Resumo Rápido da Disciplina -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="student-stat-pill" style="padding: 0.5rem 0.9rem;">
                <div>
                  <div class="student-stat-pill-val" style="font-size: 1.15rem; color: ${isRiscoFreq ? 'var(--danger)' : 'var(--success)'};">${discFreqPct}%</div>
                  <div class="student-stat-pill-lbl">Frequência</div>
                </div>
              </div>
              <div class="student-stat-pill" style="padding: 0.5rem 0.9rem;">
                <div>
                  <div class="student-stat-pill-val" style="font-size: 1.15rem; color: var(--primary);">${mediaFinal !== null ? mediaFinal : '-'}</div>
                  <div class="student-stat-pill-lbl">Média Atual</div>
                </div>
              </div>
            </div>
          </div>

          ${!activeSection ? `
            <!-- TELA 1: OS 4 CARDS DE OPÇÕES DA DISCIPLINA -->
            <div class="card" style="padding: 1.75rem 2rem;">
              <div style="margin-bottom: 1.5rem;">
                <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0;">
                  <i class="fa-solid fa-layer-group" style="color: var(--primary); margin-right: 6px;"></i> Painel da Disciplina
                </h3>
                <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0;">
                  Clique em um dos cards abaixo para visualizar as informações correspondentes:
                </p>
              </div>

              <div class="student-option-cards-grid">
                <!-- Card 1: Aulas & Frequência -->
                <div class="student-option-card" onclick="app.setStudentDiscSection('aulas')">
                  <div>
                    <div class="student-option-card-top">
                      <div class="student-option-icon icon-aulas">
                        <i class="fa-solid fa-calendar-check"></i>
                      </div>
                      <div>
                        <h4 class="student-option-title">Aulas & Frequência</h4>
                        <p class="student-option-desc">Consulte as aulas ministradas, conteúdos dados e o seu registro de presença e faltas em cada aula.</p>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 0.5rem;">
                      <span class="badge badge-primary" style="font-size: 0.76rem;"><i class="fa-solid fa-chalkboard"></i> ${discLessons.length} Aulas</span>
                      <span class="badge ${isRiscoFreq ? 'badge-danger' : 'badge-success'}" style="font-size: 0.76rem;"><i class="fa-solid ${isRiscoFreq ? 'fa-triangle-exclamation' : 'fa-check'}"></i> ${discFreqPct}% Frequência</span>
                    </div>
                  </div>
                  <div class="student-option-footer">
                    <span>Acessar Aulas & Frequência</span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>
                </div>

                <!-- Card 2: Minhas Notas & Avaliações -->
                <div class="student-option-card" onclick="app.setStudentDiscSection('notas')">
                  <div>
                    <div class="student-option-card-top">
                      <div class="student-option-icon icon-notas">
                        <i class="fa-solid fa-award"></i>
                      </div>
                      <div>
                        <h4 class="student-option-title">Minhas Notas & Avaliações</h4>
                        <p class="student-option-desc">Confira os instrumentos de avaliação, notas obtidas, pesos e cálculo da sua média final.</p>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 0.5rem;">
                      <span class="badge badge-warning" style="font-size: 0.76rem;"><i class="fa-solid fa-file-pen"></i> ${discEvals.length} Avaliações</span>
                      <span class="badge ${badgeClass === 'approved' ? 'badge-success' : (badgeClass === 'danger' ? 'badge-danger' : 'badge-warning')}" style="font-size: 0.76rem;">Média: ${mediaFinal !== null ? mediaFinal : 'Pendente'}</span>
                    </div>
                  </div>
                  <div class="student-option-footer">
                    <span>Ver Minhas Notas</span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>
                </div>

                <!-- Card 3: Bibliografia -->
                <div class="student-option-card" onclick="app.setStudentDiscSection('bibliografia')">
                  <div>
                    <div class="student-option-card-top">
                      <div class="student-option-icon icon-bibliografia">
                        <i class="fa-solid fa-book-bookmark"></i>
                      </div>
                      <div>
                        <h4 class="student-option-title">Bibliografia</h4>
                        <p class="student-option-desc">Obras básicas e complementares recomendadas pelo corpo docente para estudo e pesquisa.</p>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 0.5rem;">
                      <span class="badge badge-info" style="font-size: 0.76rem;"><i class="fa-solid fa-book"></i> ${biblios.length} Referência(s)</span>
                    </div>
                  </div>
                  <div class="student-option-footer">
                    <span>Consultar Bibliografia</span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>
                </div>

                <!-- Card 4: Informações da Disciplina -->
                <div class="student-option-card" onclick="app.setStudentDiscSection('info')">
                  <div>
                    <div class="student-option-card-top">
                      <div class="student-option-icon icon-info">
                        <i class="fa-solid fa-circle-info"></i>
                      </div>
                      <div>
                        <h4 class="student-option-title">Informações da Disciplina</h4>
                        <p class="student-option-desc">Ementa completa, objetivos de aprendizagem, carga horária e corpo docente responsável.</p>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 0.5rem;">
                      <span class="badge badge-secondary" style="font-size: 0.76rem;"><i class="fa-solid fa-clock"></i> ${disc.workload || 60}h</span>
                      <span class="badge badge-primary" style="font-size: 0.76rem;"><i class="fa-solid fa-user-tie"></i> ${teacher ? this.app.escapeHTML(teacher.nome) : 'Docente'}</span>
                    </div>
                  </div>
                  <div class="student-option-footer">
                    <span>Ver Ementa e Detalhes</span>
                    <i class="fa-solid fa-arrow-right"></i>
                  </div>
                </div>
              </div>
            </div>
          ` : `
            <!-- TELA 2: DETALHES DA SEÇÃO ESCOLHIDA (COM BOTÃO VOLTAR) -->
            <div class="card" style="padding: 1.5rem 1.75rem;">
              <!-- Barra de Navegação com Botão Voltar -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 0.75rem;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.setStudentDiscSection(null)" style="display: flex; align-items: center; gap: 8px; font-weight: 700;">
                  <i class="fa-solid fa-arrow-left"></i> Voltar para opções da disciplina
                </button>
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-main); font-size: 1.05rem;">
                  ${activeSection === 'aulas' ? '<i class="fa-solid fa-calendar-check" style="color:var(--primary);"></i> Aulas & Frequência' : ''}
                  ${activeSection === 'notas' ? '<i class="fa-solid fa-award" style="color:#d97706;"></i> Minhas Notas & Avaliações' : ''}
                  ${activeSection === 'bibliografia' ? '<i class="fa-solid fa-book-bookmark" style="color:#0284c7;"></i> Bibliografia' : ''}
                  ${activeSection === 'info' ? '<i class="fa-solid fa-circle-info" style="color:#059669;"></i> Informações da Disciplina' : ''}
                </div>
              </div>

              <!-- SEÇÃO 1: AULAS E FREQUÊNCIA -->
              ${activeSection === 'aulas' ? `
                <div>
                  <!-- Cards de Resumo de Frequência -->
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="student-stat-pill">
                      <div class="student-stat-pill-icon" style="background: rgba(79, 70, 229, 0.1); color: var(--primary);"><i class="fa-solid fa-chalkboard"></i></div>
                      <div>
                        <div class="student-stat-pill-val">${discLessons.length}</div>
                        <div class="student-stat-pill-lbl">Aulas Ministradas</div>
                      </div>
                    </div>
                    <div class="student-stat-pill">
                      <div class="student-stat-pill-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--success);"><i class="fa-solid fa-check"></i></div>
                      <div>
                        <div class="student-stat-pill-val" style="color: var(--success);">${presencas}</div>
                        <div class="student-stat-pill-lbl">Presenças Registradas</div>
                      </div>
                    </div>
                    <div class="student-stat-pill">
                      <div class="student-stat-pill-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);"><i class="fa-solid fa-xmark"></i></div>
                      <div>
                        <div class="student-stat-pill-val" style="color: var(--danger);">${faltas}</div>
                        <div class="student-stat-pill-lbl">Faltas</div>
                      </div>
                    </div>
                    <div class="student-stat-pill">
                      <div class="student-stat-pill-icon" style="background: ${isRiscoFreq ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${isRiscoFreq ? 'var(--danger)' : 'var(--success)'};">
                        <i class="fa-solid ${isRiscoFreq ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                      </div>
                      <div>
                        <div class="student-stat-pill-val" style="color: ${isRiscoFreq ? 'var(--danger)' : 'var(--success)'};">${discFreqPct}%</div>
                        <div class="student-stat-pill-lbl">${isRiscoFreq ? 'Risco de Reprovação (< 75%)' : 'Frequência Regular'}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Lista de Aulas e Chamadas -->
                  <div class="table-responsive">
                    <table class="table">
                      <thead>
                        <tr>
                          <th style="width: 120px;">Data da Aula</th>
                          <th>Conteúdo Ministrado</th>
                          <th style="text-align: center; width: 160px;">Seu Registro</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${discLessons.length === 0 ? `
                          <tr>
                            <td colspan="3" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                              <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; opacity: 0.35; margin-bottom: 0.5rem; display: block;"></i>
                              Nenhuma aula lançada no diário pelo professor até o momento.
                            </td>
                          </tr>
                        ` : discLessons.map((les, idx) => {
                          const att = this.app.state.attendance ? this.app.state.attendance[les.id] : null;
                          const status = (att && att[student.id]) ? att[student.id] : 'Presente';
                          
                          let badgeHtml = `<span class="student-att-badge-presente"><i class="fa-solid fa-circle-check"></i> Presente</span>`;
                          if (status === 'Ausente') {
                            badgeHtml = `<span class="student-att-badge-ausente"><i class="fa-solid fa-circle-xmark"></i> Ausente</span>`;
                          } else if (status === 'Justificado') {
                            badgeHtml = `<span class="student-att-badge-justificado"><i class="fa-solid fa-clock"></i> Justificado</span>`;
                          }

                          return `
                            <tr>
                              <td>
                                <span style="font-family: var(--font-mono); font-weight: 700; color: var(--text-main);">${this.app.formatDateBR(les.data)}</span>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">Aula #${discLessons.length - idx}</div>
                              </td>
                              <td>
                                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 3px;">
                                  ${this.app.escapeHTML(les.titulo || 'Aula Regular')}
                                </div>
                                <div style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.45;">
                                  ${this.app.escapeHTML(les.conteudo || 'Registro de aula presencial/remota.')}
                                </div>
                                ${les.materialUrl ? `
                                  <div style="margin-top: 6px;">
                                    <a href="${this.app.escapeHTML(les.materialUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="font-size:0.75rem; padding: 2px 10px; display:inline-flex; align-items:center; gap:6px; border-radius: 6px; text-decoration:none;">
                                      <i class="fa-solid fa-cloud-arrow-down"></i> ${this.app.escapeHTML(les.materialTitle || 'Material de Aula / Slides')}
                                    </a>
                                  </div>
                                ` : ''}
                              </td>
                              <td style="text-align: center;">
                                ${badgeHtml}
                              </td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : ''}

              <!-- SEÇÃO 2: NOTAS E AVALIAÇÕES -->
              ${activeSection === 'notas' ? `
                <div>
                  <!-- Resumo de Média e Status de Aprovação -->
                  <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                    <div>
                      <h4 style="margin: 0 0 4px 0; font-family: var(--font-heading); font-size: 1.1rem; color: var(--text-main);">Critério de Avaliação Institucional</h4>
                      <p style="margin: 0; font-size: 0.82rem; color: var(--text-muted);">
                        Nota mínima para aprovação direta: <strong>${notaCorte.toFixed(1)}</strong> • Nota mínima para exame: <strong>${notaExame.toFixed(1)}</strong>
                      </p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                      <div style="text-align: right;">
                        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Média Parcial / Final</div>
                        <div style="font-size: 1.6rem; font-weight: 800; font-family: var(--font-heading); color: var(--primary);">${mediaFinal !== null ? mediaFinal : 'Pendente'}</div>
                      </div>
                      <span class="student-grade-badge ${badgeClass}">${statusNota}</span>
                    </div>
                  </div>

                  <!-- Tabela de Avaliações -->
                  <div class="table-responsive">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Avaliação / Atividade</th>
                          <th style="text-align: center; width: 100px;">Peso</th>
                          <th style="text-align: center; width: 140px;">Sua Nota</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${gradesList.length === 0 ? `
                          <tr>
                            <td colspan="4" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                              <i class="fa-solid fa-award" style="font-size: 2rem; opacity: 0.35; margin-bottom: 0.5rem; display: block;"></i>
                              Nenhum instrumento de avaliação cadastrado pelo professor ainda.
                            </td>
                          </tr>
                        ` : gradesList.map(item => {
                          const ev = item.evaluation;
                          const gr = item.grade;
                          const isOk = gr !== null && gr >= notaCorte;

                          return `
                            <tr>
                              <td>
                                <strong style="color: var(--text-main); font-size: 0.95rem;">${this.app.escapeHTML(ev.title)}</strong>
                                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">Instrumento de avaliação curricular</div>
                              </td>
                              <td style="text-align: center; font-weight: 700; color: var(--text-muted);">
                                ${item.weight.toFixed(1)}
                              </td>
                              <td style="text-align: center;">
                                ${gr !== null ? `
                                  <span style="font-size: 1.15rem; font-weight: 800; font-family: var(--font-heading); color: ${isOk ? 'var(--success)' : 'var(--danger)'};">
                                    ${gr.toFixed(1)}
                                  </span>
                                  <span style="font-size: 0.75rem; color: var(--text-muted);">/ 10.0</span>
                                ` : `
                                  <span class="badge badge-secondary" style="font-size: 0.75rem;">Aguardando nota</span>
                                `}
                              </td>
                              <td>
                                ${gr !== null ? (isOk 
                                  ? `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Acima da Média</span>` 
                                  : `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Atenção</span>`) 
                                  : `<span style="font-size: 0.82rem; color: var(--text-muted);">Não lançado</span>`}
                              </td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : ''}

              <!-- SEÇÃO 3: BIBLIOGRAFIA -->
              ${activeSection === 'bibliografia' ? `
                <div>
                  <h4 style="margin: 0 0 1rem 0; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text-main);">
                    <i class="fa-solid fa-book-bookmark" style="color: var(--primary);"></i> Referências Bibliográficas Recomendadas
                  </h4>

                  ${biblios.length === 0 ? `
                    <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); background: var(--bg-main); border-radius: 8px; border: 1px dashed var(--border-color);">
                      <i class="fa-solid fa-book-open" style="font-size: 2.2rem; opacity: 0.35; margin-bottom: 0.5rem; display: block;"></i>
                      Nenhuma obra bibliográfica associada a esta disciplina até o momento.
                    </div>
                  ` : `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                      ${biblios.map(b => {
                        const isBasica = b.type === 'Básica';
                        return `
                          <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                              <div style="width: 44px; height: 44px; border-radius: 10px; background: ${isBasica ? 'rgba(79, 70, 229, 0.1)' : 'rgba(14, 165, 233, 0.1)'}; color: ${isBasica ? 'var(--primary)' : 'var(--accent)'}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">
                                <i class="fa-solid fa-book"></i>
                              </div>
                              <div>
                                <div style="font-weight: 700; font-size: 1rem; color: var(--text-main); margin-bottom: 2px;">
                                  ${this.app.escapeHTML(b.title)}
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-muted);">
                                  <i class="fa-solid fa-user-pen" style="font-size: 0.75rem; margin-right: 4px;"></i> Autor: <strong>${this.app.escapeHTML(b.author || 'Não especificado')}</strong>
                                </div>
                              </div>
                            </div>
                            <span class="badge ${isBasica ? 'badge-primary' : 'badge-info'}" style="font-size: 0.78rem;">
                              Bibliografia ${this.app.escapeHTML(b.type || 'Geral')}
                            </span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              ` : ''}

              <!-- SEÇÃO 4: INFORMAÇÕES GERAIS -->
              ${activeSection === 'info' ? `
                <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                  <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 1.25rem 1.5rem;">
                    <h4 style="margin: 0 0 0.5rem 0; font-family: var(--font-heading); color: var(--text-main);">Ementa da Disciplina</h4>
                    <p style="margin: 0; font-size: 0.92rem; color: var(--text-muted); line-height: 1.6;">
                      ${this.app.escapeHTML(disc.syllabus || disc.description || 'Aborda os conceitos fundamentais, práticas estruturadas e metodologias aplicadas na área de conhecimento da disciplina, preparando o estudante para a resolução de problemas reais do mercado de trabalho e sólida base acadêmica.')}
                    </p>
                  </div>

                  <div class="grid-2">
                    <div class="card" style="padding: 1.25rem;">
                      <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">Carga Horária Total</div>
                      <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main);">${disc.workload || 60} horas (${Math.round((disc.workload || 60) / 15)} horas semanais)</div>
                    </div>
                    <div class="card" style="padding: 1.25rem;">
                      <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 4px;">Corpo Docente Responsável</div>
                      <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main);">${teacher ? this.app.escapeHTML(teacher.nome) : 'Atribuição Direta'}</div>
                      ${teacher && teacher.email ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">${this.app.escapeHTML(teacher.email)}</div>` : ''}
                    </div>
                  </div>
                </div>
              ` : ''}

            </div>
          `}
        </div>
      `;
      return;
    }

    // Identificar disciplinas em risco de frequência (< 75%)
    const disciplinesWithRisk = [];
    studentDisciplines.forEach(item => {
      const disc = item.discipline;
      const turma = item.turma;
      const lessons = (this.app.state.lessons || []).filter(l => {
        if (item.td && l.turmaDisciplinaId === item.td.id) return true;
        if (turma && l.turmaId === turma.id) return true;
        return false;
      });
      if (lessons.length > 0) {
        let pres = 0;
        lessons.forEach(l => {
          const att = this.app.state.attendance ? this.app.state.attendance[l.id] : null;
          if (att && att[student.id]) {
            if (att[student.id] === 'Presente' || att[student.id] === 'Justificado') pres++;
          } else {
            pres++;
          }
        });
        const pct = Math.round((pres / lessons.length) * 100);
        if (pct < 75) {
          disciplinesWithRisk.push({ name: disc.name, pct });
        }
      }
    });

    // Calcular progresso curricular do curso
    const totalCourseDisciplines = (this.app.state.disciplines || []).filter(d => !studentCourse.id || d.courseId === studentCourse.id).length || studentDisciplines.length || 1;
    const progressPercent = Math.min(100, Math.round((studentDisciplines.length / Math.max(totalCourseDisciplines, 1)) * 100));

    // Aulas de hoje do estudante
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const currentDayName = dayNames[new Date().getDay()];
    const studentTurmaIds = studentTurmas.map(t => t.id);
    const todaySchedules = (this.app.state.schedules || []).filter(s => {
      if (s.schoolId && schoolId && s.schoolId !== schoolId) return false;
      if (s.dayOfWeek !== currentDayName) return false;
      const [tId] = (s.turmaId || '').split('__');
      return studentTurmaIds.includes(tId);
    });

    // -------------------------------------------------------------------------
    // CASO 2: LISTAGEM GERAL DE DISCIPLINAS DO CURSO DO ALUNO
    // -------------------------------------------------------------------------
    container.innerHTML = `
      <!-- Banner de Boas-Vindas do Curso -->
      <div class="student-course-header">
        <div class="student-course-title-box">
          <div class="student-course-icon">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <div>
            <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--primary); font-weight: 800; margin-bottom: 2px;">
              MEU CURSO ACADÊMICO
            </div>
            <h2 class="student-course-name">${this.app.escapeHTML(studentCourse.name)}</h2>
            <div class="student-course-meta">
              <span><i class="fa-solid fa-id-card"></i> RA: <strong>${this.app.escapeHTML(student.ra || 'Não informado')}</strong></span>
              <span>•</span>
              <span><i class="fa-solid fa-clock"></i> Carga Horária: <strong>${studentCourse.workload || 2400}h</strong></span>
              <span>•</span>
              <span><i class="fa-solid fa-school"></i> ${this.app.escapeHTML(activeSchool.nome)}</span>
            </div>
            <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" onclick="app.academicReportsModule.generateBoletim('${student.id}')" title="Emitir Boletim Escolar Oficial do Semestre em PDF">
                <i class="fa-solid fa-file-pdf"></i> Emitir Boletim Escolar (PDF)
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="app.openStudentCardModal('${student.id}')" title="Abrir Carteira de Identificação Estudantil">
                <i class="fa-solid fa-id-card"></i> Carteirinha Digital (CIE)
              </button>
            </div>
          </div>
        </div>

        <!-- Indicadores Globais do Aluno -->
        <div class="student-course-stats">
          <div class="student-stat-pill">
            <div class="student-stat-pill-icon" style="background: rgba(79, 70, 229, 0.1); color: var(--primary);">
              <i class="fa-solid fa-book-bookmark"></i>
            </div>
            <div>
              <div class="student-stat-pill-val">${studentDisciplines.length}</div>
              <div class="student-stat-pill-lbl">Disciplinas Ativas</div>
            </div>
          </div>

          <div class="student-stat-pill">
            <div class="student-stat-pill-icon" style="background: ${globalFreqPct < 75 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${globalFreqPct < 75 ? 'var(--danger)' : 'var(--success)'};">
              <i class="fa-solid fa-clipboard-user"></i>
            </div>
            <div>
              <div class="student-stat-pill-val" style="color: ${globalFreqPct < 75 ? 'var(--danger)' : 'var(--success)'};">${globalFreqPct}%</div>
              <div class="student-stat-pill-lbl">Frequência Global</div>
            </div>
          </div>

          <div class="student-stat-pill">
            <div class="student-stat-pill-icon" style="background: rgba(14, 165, 233, 0.1); color: var(--accent);">
              <i class="fa-solid fa-award"></i>
            </div>
            <div>
              <div class="student-stat-pill-val" style="color: var(--primary);">${globalAverage}</div>
              <div class="student-stat-pill-lbl">Média Acumulada</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Alerta Preventivo de Frequência em Risco -->
      ${(disciplinesWithRisk.length > 0 || globalFreqPct < 75) ? `
        <div class="student-risk-banner">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.4rem; color: var(--danger); margin-top: 2px;"></i>
          <div style="flex: 1;">
            <strong style="color: var(--danger); font-size: 0.95rem; display: block; margin-bottom: 2px;">
              Atenção: Risco de Reprovação por Frequência (${disciplinesWithRisk.length > 0 ? `${disciplinesWithRisk.length} disciplina(s) abaixo de 75%` : 'Média Geral Baixa'})
            </strong>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.5;">
              ${disciplinesWithRisk.length > 0 
                ? `As disciplinas <strong>${disciplinesWithRisk.map(d => `${this.app.escapeHTML(d.name)} (${d.pct}%)`).join(', ')}</strong> estão abaixo do patamar mínimo regulamentar de 75%. Mantenha sua assiduidade ou apresente atestados para justificar faltas.` 
                : `Sua frequência global atual é de ${globalFreqPct}%. Compareça às próximas aulas para manter sua regularidade acadêmica.`}
            </p>
          </div>
        </div>
      ` : ''}

      <!-- Horário de Aulas de Hoje -->
      ${todaySchedules.length > 0 ? `
        <div class="student-next-class-card">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(30,77,119,0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">
              <i class="fa-solid fa-calendar-day"></i>
            </div>
            <div>
              <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; color: var(--primary); letter-spacing: 0.03em;">Hoje (${currentDayName})</div>
              <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">${todaySchedules.length} aula(s) programada(s) para hoje</div>
              <div style="font-size: 0.84rem; color: var(--text-muted); margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap;">
                ${todaySchedules.map(ts => `<span class="badge" style="background: rgba(30,77,119,0.08);"><i class="fa-regular fa-clock"></i> ${ts.startTime || ''} às ${ts.endTime || ''}</span>`).join('')}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="app.switchTab('tab-horarios')">
            <i class="fa-solid fa-clock"></i> Ver Grade Completa
          </button>
        </div>
      ` : ''}

      <!-- Barra de Progresso do Semestre / Curso -->
      <div class="student-progress-wrapper">
        <div class="student-progress-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-bars-progress" style="color: var(--primary); font-size: 1.1rem;"></i>
            <strong style="font-size: 0.95rem; color: var(--text-main);">Progresso Acadêmico do Curso</strong>
          </div>
          <span style="font-size: 0.88rem; font-weight: 700; color: var(--primary);">${progressPercent}% das disciplinas ativas</span>
        </div>
        <div class="student-progress-bar-bg">
          <div class="student-progress-bar-fill" style="width: ${progressPercent}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap; gap: 4px;">
          <span><strong>${studentDisciplines.length}</strong> disciplina(s) em andamento</span>
          <span>Carga Horária Total do Curso: <strong>${studentCourse.workload || 2400}h</strong></span>
        </div>
      </div>

      <!-- Mural de Avisos no Painel do Aluno -->
      ${studentNotices.length > 0 ? `
        <div class="card" style="margin-bottom: 1.5rem; border-left: 4px solid var(--primary); background: linear-gradient(to right, rgba(30,77,119,0.03), var(--bg-card));">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary);">
              <i class="fa-solid fa-bullhorn"></i> Mural de Comunicados da Instituição
            </div>
            <span class="badge badge-primary" style="font-size: 0.72rem;">${studentNotices.length} comunicado(s)</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${studentNotices.map(n => `
              <div style="padding: 0.75rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <strong style="font-size: 0.95rem; color: var(--text-main); font-family: var(--font-heading);">${this.app.escapeHTML(n.title)}</strong>
                  <span class="notice-badge notice-badge-${n.category || 'geral'}">${n.category === 'urgente' ? 'Urgente' : (n.category === 'avaliacao' ? 'Avaliação' : 'Aviso')}</span>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.5;">${this.app.escapeHTML(n.message)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Título da Seção de Disciplinas -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
        <div>
          <h3 style="font-family: var(--font-heading); font-size: 1.25rem; color: var(--text-main); margin: 0 0 4px 0;">
            Disciplinas em Andamento
          </h3>
          <p style="margin: 0; font-size: 0.88rem; color: var(--text-muted);">
            Clique em qualquer disciplina para acompanhar aulas, frequência registrada, notas e livros recomendados.
          </p>
        </div>
      </div>

      <!-- Grid de Cards de Disciplinas -->
      ${studentDisciplines.length === 0 ? `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <i class="fa-solid fa-book-open" style="font-size: 2.5rem; opacity: 0.35; margin-bottom: 0.85rem; display: block;"></i>
          <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 0.35rem;">Nenhuma disciplina vinculada</h4>
          <p style="font-size: 0.88rem; max-width: 460px; margin: 0 auto;">
            Sua matrícula ainda não possui turmas ou disciplinas ativas para este semestre. Contate a secretaria.
          </p>
        </div>
      ` : `
        <div class="student-discs-grid">
          ${studentDisciplines.map(item => {
            const disc = item.discipline;
            const turma = item.turma;
            const td = item.td;
            const teacher = item.teacher;

            // Calcular frequência nesta matéria
            const lessons = (this.app.state.lessons || []).filter(l => {
              if (td && l.turmaDisciplinaId === td.id) return true;
              if (turma && l.turmaId === turma.id) return true;
              return false;
            });

            let pres = 0;
            lessons.forEach(l => {
              const att = this.app.state.attendance ? this.app.state.attendance[l.id] : null;
              if (att && att[student.id]) {
                if (att[student.id] === 'Presente' || att[student.id] === 'Justificado') pres++;
              } else {
                pres++;
              }
            });
            const freq = lessons.length > 0 ? Math.round((pres / lessons.length) * 100) : 100;
            const isRisco = freq < 75;

            // Calcular média nesta matéria
            const evals = (this.app.state.evaluations || []).filter(ev => {
              if (td && ev.turmaDisciplinaId === td.id) return true;
              if (ev.disciplineId === disc.id) return true;
              if (turma && ev.turmaId === turma.id) return true;
              return false;
            });

            let sW = 0;
            let sG = 0;
            evals.forEach(ev => {
              const gKey = `${ev.id}_${student.id}`;
              if (this.app.state.studentGrades && this.app.state.studentGrades[gKey] !== undefined) {
                const w = parseFloat(ev.weight) || 1.0;
                sW += w;
                sG += parseFloat(this.app.state.studentGrades[gKey]) * w;
              }
            });
            const mediaStr = sW > 0 ? (sG / sW).toFixed(1) : '-';

            return `
              <div class="student-disc-card" onclick="app.selectStudentDiscipline('${disc.id}')">
                <div>
                  <div class="student-disc-card-top">
                    <span class="student-disc-code-badge">${this.app.escapeHTML(disc.code || 'DISC')}</span>
                    <span class="badge ${isRisco ? 'badge-danger' : 'badge-success'}" style="font-size: 0.72rem;">
                      <i class="fa-solid ${isRisco ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${isRisco ? 'Atenção Freq.' : 'Regular'}
                    </span>
                  </div>

                  <h3 class="student-disc-name">${this.app.escapeHTML(disc.name)}</h3>

                  <div class="student-disc-teacher">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    <span>${teacher ? this.app.escapeHTML(teacher.nome) : 'Professor a definir'}</span>
                  </div>

                  <div class="student-disc-metrics-row">
                    <div class="student-disc-metric-item">
                      <div class="val">${disc.workload || 60}h</div>
                      <div class="lbl">Carga Horária</div>
                    </div>
                    <div class="student-disc-metric-item">
                      <div class="val" style="color: ${isRisco ? 'var(--danger)' : 'var(--success)'};">${freq}%</div>
                      <div class="lbl">Frequência</div>
                    </div>
                    <div class="student-disc-metric-item">
                      <div class="val" style="color: var(--primary);">${mediaStr}</div>
                      <div class="lbl">Média</div>
                    </div>
                  </div>
                </div>

                <button type="button" class="student-disc-action-btn">
                  <span>Visualizar Aulas, Frequência & Notas</span>
                  <i class="fa-solid fa-chevron-right" style="font-size: 0.8rem;"></i>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
  }

  selectStudentDiscipline(discId, section = null) {
    this.app.selectedStudentDisciplineId = discId;
    this.app.studentDiscActiveSection = section;
    this.renderMeuCurso();
  }

  backToStudentDisciplines() {
    this.app.selectedStudentDisciplineId = null;
    this.app.studentDiscActiveSection = null;
    this.renderMeuCurso();
  }

  setStudentDiscSection(section) {
    this.app.studentDiscActiveSection = section;
    this.renderMeuCurso();
  }

  openStudentDisciplineFrequency(discId) {
    this.selectStudentDiscipline(discId, 'aulas');
    this.app.switchTab('tab-meu-curso');
  }

  openStudentDisciplineGrades(discId) {
    this.selectStudentDiscipline(discId, 'notas');
    this.app.switchTab('tab-meu-curso');
  }

  goToStudentDisciplines() {
    this.backToStudentDisciplines();
    this.app.switchTab('tab-meu-curso');
  }

  goToStudentFrequency() {
    this.app.switchTab('tab-meu-curso');
    if (!this.app.selectedStudentDisciplineId) {
      const activeSchool = this.app.getActiveSchool();
      const schoolId = activeSchool ? activeSchool.id : null;
      const studentUser = (this.app.currentUser && this.app.currentUser.tipo === 'aluno')
        ? this.app.currentUser
        : (this.app.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.app.state.users.find(u => u.tipo === 'aluno'));
      if (studentUser) {
        const studentTurmas = (this.app.state.classes || []).filter(t => t.schoolId === schoolId && (t.studentIds || []).includes(studentUser.id));
        const firstTurma = studentTurmas[0];
        if (firstTurma) {
          this.app.ensureTurmaDisciplines(firstTurma);
          const firstTd = (firstTurma.disciplines || []).find(d => d.status !== 'arquivada');
          const targetDiscId = firstTd ? firstTd.disciplineId : firstTurma.disciplineId;
          if (targetDiscId) {
            this.selectStudentDiscipline(targetDiscId, 'aulas');
            return;
          }
        }
      }
    } else {
      this.setStudentDiscSection('aulas');
    }
  }

  goToStudentGrades() {
    this.app.switchTab('tab-meu-curso');
    if (!this.app.selectedStudentDisciplineId) {
      const activeSchool = this.app.getActiveSchool();
      const schoolId = activeSchool ? activeSchool.id : null;
      const studentUser = (this.app.currentUser && this.app.currentUser.tipo === 'aluno')
        ? this.app.currentUser
        : (this.app.state.users.find(u => u.tipo === 'aluno' && u.schoolId === schoolId) || this.app.state.users.find(u => u.tipo === 'aluno'));
      if (studentUser) {
        const studentTurmas = (this.app.state.classes || []).filter(t => t.schoolId === schoolId && (t.studentIds || []).includes(studentUser.id));
        const firstTurma = studentTurmas[0];
        if (firstTurma) {
          this.ensureTurmaDisciplines(firstTurma);
          const firstTd = (firstTurma.disciplines || []).find(d => d.status !== 'arquivada');
          const targetDiscId = firstTd ? firstTd.disciplineId : firstTurma.disciplineId;
          if (targetDiscId) {
            this.selectStudentDiscipline(targetDiscId, 'notas');
            return;
          }
        }
      }
    } else {
      this.setStudentDiscSection('notas');
    }
  }
}
