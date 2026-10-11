/**
 * academicReports.js - Módulo de Emissão de Relatórios Acadêmicos Oficiais
 * Boletim Escolar do Aluno & Diário de Classe do Professor
 * Portal do Curso
 */

export class AcademicReportsModule {
  constructor(app) {
    this.app = app;
  }

  get state() {
    return this.app.state;
  }

  /* =========================================================================
     1. EMISSÃO DE BOLETIM ESCOLAR OFICIAL DO ALUNO
     ========================================================================= */
  generateBoletim(studentId, turmaId = null) {
    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    const student = (this.state.users || []).find(u => u.id === studentId);
    if (!student) {
      this.app.showToast('Dados do aluno não encontrados para emissão do boletim.', 'error');
      return;
    }

    // Se turmaId não for informado, busca a primeira turma ativa do aluno
    let turma = null;
    if (turmaId) {
      turma = (this.state.classes || []).find(t => t.id === turmaId);
    } else {
      turma = (this.state.classes || []).find(t => t.schoolId === activeSchool.id && (t.studentIds || []).includes(student.id));
    }

    if (!turma) {
      this.app.showToast('O aluno não está enturmado em nenhuma turma desta instituição.', 'warning');
      return;
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const disciplineIds = turma.disciplineIds || (course ? course.disciplineIds || [] : []);
    const disciplines = (this.state.disciplines || []).filter(d => disciplineIds.includes(d.id));

    // Critérios de avaliação da turma
    const notaAprovacao = parseFloat(turma.notaAprovacao) || 6.0;
    const notaExame = parseFloat(turma.notaExame) || 4.0;
    const freqMinima = parseFloat(turma.freqMinima) || 75;

    let somaMedias = 0;
    let disciplinasAvaliadas = 0;
    let totalAulasGeral = 0;
    let totalPresencasGeral = 0;
    let aprovadasCount = 0;

    const rowsHtml = disciplines.map((disc, idx) => {
      // 1. Notas da disciplina
      const rawGrades = Array.isArray(this.state.grades)
        ? this.state.grades
        : (this.state.grades && typeof this.state.grades === 'object'
            ? Object.values(this.state.grades).filter(g => g && typeof g === 'object')
            : []);

      let studentGrades = rawGrades.filter(g => 
        g && g.studentId === student.id && 
        g.turmaId === turma.id && 
        g.disciplineId === disc.id
      );

      // Compatibilidade com o sistema moderno de avaliações (evaluations + studentGrades)
      if (studentGrades.length === 0 && Array.isArray(this.state.evaluations)) {
        const evals = this.state.evaluations.filter(ev => {
          const matchTurma = ev.turmaId === turma.id || (ev.rawTurmaId && ev.rawTurmaId.startsWith(turma.id));
          const matchDisc = ev.disciplineId === disc.id;
          return matchTurma && matchDisc;
        });

        if (evals.length > 0 && this.state.studentGrades) {
          studentGrades = evals.map(ev => {
            const score = this.state.studentGrades[`${ev.id}_${student.id}`];
            if (score !== undefined && score !== null && score !== '') {
              return {
                grade: score,
                weight: ev.weight || 1.0,
                evalName: ev.name
              };
            }
            return null;
          }).filter(Boolean);
        }
      }

      let media = '-';
      let notasDetail = '';
      if (studentGrades.length > 0) {
        let somaNotasPonderadas = 0;
        let somaPesos = 0;
        const notasArr = [];

        studentGrades.forEach(g => {
          const val = parseFloat(g.grade);
          const peso = parseFloat(g.weight) || 1.0;
          if (!isNaN(val)) {
            somaNotasPonderadas += (val * peso);
            somaPesos += peso;
            notasArr.push(`${g.evalName || 'Av'}: ${val.toFixed(1)}`);
          }
        });

        if (somaPesos > 0) {
          const calcMedia = somaNotasPonderadas / somaPesos;
          media = calcMedia.toFixed(1);
          somaMedias += calcMedia;
          disciplinasAvaliadas++;
        }
        notasDetail = notasArr.join(' • ') || '-';
      } else {
        notasDetail = 'Sem avaliações';
      }

      // 2. Frequência da disciplina
      const lessons = (this.state.lessons || []).filter(l => 
        l.turmaId === turma.id && 
        l.disciplineId === disc.id
      );

      const totalAulas = lessons.length;
      let totalPresencas = 0;

      lessons.forEach(l => {
        if (l.attendance && l.attendance[student.id] === 'presente') {
          totalPresencas++;
        }
      });

      const totalFaltas = Math.max(0, totalAulas - totalPresencas);
      const freqPct = totalAulas > 0 ? Math.round((totalPresencas / totalAulas) * 100) : 100;

      totalAulasGeral += totalAulas;
      totalPresencasGeral += totalPresencas;

      // 3. Situação Acadêmica
      let situacao = 'Cursando';
      let sitColor = '#3b82f6';

      if (media !== '-') {
        const mNum = parseFloat(media);
        if (mNum >= notaAprovacao && freqPct >= freqMinima) {
          situacao = 'Aprovado';
          sitColor = '#059669';
          aprovadasCount++;
        } else if (mNum >= notaExame && freqPct >= freqMinima) {
          situacao = 'Exame Final';
          sitColor = '#d97706';
        } else {
          situacao = 'Reprovado';
          sitColor = '#ef4444';
        }
      }

      return `
        <tr>
          <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
          <td>
            <strong>${this.app.escapeHTML(disc.nome)}</strong>
            <div style="font-size: 0.75rem; color: #64748b;">Cód: ${this.app.escapeHTML(disc.code || '-')} • Carga Horária: ${disc.workload || 40}h</div>
          </td>
          <td style="font-size: 0.78rem; color: #475569;">${this.app.escapeHTML(notasDetail)}</td>
          <td style="text-align: center; font-weight: 800; font-size: 1rem; color: #0f172a;">${media}</td>
          <td style="text-align: center;">${totalAulas}</td>
          <td style="text-align: center; color: ${totalFaltas > 0 ? '#dc2626' : '#64748b'};">${totalFaltas}</td>
          <td style="text-align: center; font-weight: 700; color: ${freqPct >= freqMinima ? '#059669' : '#dc2626'};">${totalAulas > 0 ? `${freqPct}%` : '100%'}</td>
          <td style="text-align: center; font-weight: 700; color: ${sitColor};">${situacao}</td>
        </tr>
      `;
    }).join('');

    const mediaGeral = disciplinasAvaliadas > 0 ? (somaMedias / disciplinasAvaliadas).toFixed(1) : '-';
    const freqGeral = totalAulasGeral > 0 ? Math.round((totalPresencasGeral / totalAulasGeral) * 100) : 100;
    const emitidoEm = new Date().toLocaleDateString('pt-BR');

    const htmlContent = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #0f172a; line-height: 1.4; padding: 1.5cm 1cm; background: #ffffff;">
        <!-- Cabeçalho Oficial -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; font-size: 1.35rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
              ${this.app.escapeHTML(activeSchool.nome || 'Portal do Curso')}
            </h1>
            <p style="margin: 3px 0 0 0; font-size: 0.82rem; color: #475569;">
              Registro Escolar & Gestão Acadêmica Integrada • CNPJ: ${this.app.escapeHTML(activeSchool.cnpj || '00.000.000/0001-00')}
            </p>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; padding: 4px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.5px;">
              BOLETIM ESCOLAR OFICIAL
            </div>
            <div style="font-size: 0.74rem; color: #64748b; margin-top: 4px;">Emissão: ${emitidoEm}</div>
          </div>
        </div>

        <!-- Dados Cadastrais do Aluno -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 0.84rem;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 8px;">
            <div><strong>Aluno(a):</strong> ${this.app.escapeHTML(student.nome)}</div>
            <div><strong>RA:</strong> ${this.app.escapeHTML(student.ra || 'S/ RA')}</div>
            <div><strong>CPF:</strong> ${this.app.escapeHTML(student.cpf || 'Não informado')}</div>
          </div>
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px;">
            <div><strong>Curso:</strong> ${course ? this.app.escapeHTML(course.name) : 'Geral'}</div>
            <div><strong>Turma:</strong> ${this.app.escapeHTML(turma.nome)}</div>
            <div><strong>Nascimento:</strong> ${this.app.escapeHTML(student.dataNascimento || '-')}</div>
          </div>
          ${student.telefone || student.endereco ? `
            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 0.78rem; color: #475569;">
              <div><strong>Telefone:</strong> ${this.app.escapeHTML(student.telefone || '-')}</div>
              <div><strong>Endereço:</strong> ${this.app.escapeHTML(student.endereco || '-')}</div>
            </div>
          ` : ''}
        </div>

        <!-- Tabela Analítica de Disciplinas e Médias -->
        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 20px;">
          <thead>
            <tr style="background: #0f172a; color: #ffffff;">
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 30px;">#</th>
              <th style="padding: 8px 8px; border: 1px solid #0f172a; text-align: left;">Componente Curricular / Disciplina</th>
              <th style="padding: 8px 8px; border: 1px solid #0f172a; text-align: left;">Avaliações Realizadas</th>
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 65px;">Média</th>
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 45px;">Aulas</th>
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 45px;">Faltas</th>
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 60px;">Freq. %</th>
              <th style="padding: 8px 6px; border: 1px solid #0f172a; width: 90px;">Situação</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Nenhuma disciplina vinculada à turma.</td></tr>`}
          </tbody>
        </table>

        <!-- Resumo Acadêmico & Indicadores -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 30px;">
          <div style="border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.74rem; color: #64748b; text-transform: uppercase;">Média Global do Aluno</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #0f172a; margin-top: 2px;">${mediaGeral}</div>
          </div>
          <div style="border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.74rem; color: #64748b; text-transform: uppercase;">Frequência Geral</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: ${freqGeral >= freqMinima ? '#059669' : '#dc2626'}; margin-top: 2px;">${freqGeral}%</div>
          </div>
          <div style="border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.74rem; color: #64748b; text-transform: uppercase;">Aprovações</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: #059669; margin-top: 2px;">${aprovadasCount} de ${disciplines.length}</div>
          </div>
        </div>

        <!-- Critérios de Aprovação -->
        <div style="font-size: 0.74rem; color: #64748b; border-left: 3px solid #cbd5e1; padding-left: 8px; margin-bottom: 40px; line-height: 1.5;">
          <strong>Critérios Institucionais:</strong> Média mínima para aprovação direta: <strong>${notaAprovacao.toFixed(1)}</strong> • 
          Média para exame: entre <strong>${notaExame.toFixed(1)}</strong> e <strong>${(notaAprovacao - 0.1).toFixed(1)}</strong> • 
          Frequência mínima obrigatória: <strong>${freqMinima}%</strong>.
        </div>

        <!-- Assinaturas -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center;">
          <div>
            <div style="border-top: 1px solid #0f172a; width: 85%; margin: 0 auto; padding-top: 5px;">
              <strong style="font-size: 0.8rem; display: block;">Secretaria Acadêmica</strong>
              <span style="font-size: 0.72rem; color: #64748b;">Assinatura / Carimbo</span>
            </div>
          </div>
          <div>
            <div style="border-top: 1px solid #0f172a; width: 85%; margin: 0 auto; padding-top: 5px;">
              <strong style="font-size: 0.8rem; display: block;">Coordenação Pedagógica</strong>
              <span style="font-size: 0.72rem; color: #64748b;">Assinatura / Visto</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.openReportPreviewModal('Boletim Escolar Oficial', htmlContent);
  }

  /* =========================================================================
     2. EMISSÃO DO DIÁRIO DE CLASSE DO PROFESSOR
     ========================================================================= */
  generateDiarioClasse(turmaId, disciplineId) {
    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) {
      this.app.showToast('Selecione uma turma para emitir o Diário de Classe.', 'warning');
      return;
    }

    const discipline = (this.state.disciplines || []).find(d => d.id === disciplineId);
    if (!discipline) {
      this.app.showToast('Selecione uma disciplina para emitir o Diário de Classe.', 'warning');
      return;
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);

    // Encontrar professor atribuído
    let teacherName = 'Docente Não Vinculado';
    const teacherId = turma.teacherAssignments ? turma.teacherAssignments[discipline.id] : null;
    if (teacherId) {
      const teacher = (this.state.users || []).find(u => u.id === teacherId);
      if (teacher) teacherName = teacher.nome;
    }

    // Aulas ministradas
    const lessons = (this.state.lessons || []).filter(l => 
      l.turmaId === turma.id && 
      l.disciplineId === discipline.id
    ).sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    // Alunos enturmados
    const studentIds = turma.studentIds || [];
    const students = (this.state.users || []).filter(u => 
      u.tipo === 'aluno' && studentIds.includes(u.id)
    ).sort((a, b) => a.nome.localeCompare(b.nome));

    // Mapa de chamada (Tabela de presença)
    const tablePresenceHeader = lessons.map((l, i) => {
      const dParts = (l.data || '').split('-');
      const dLabel = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}` : `A${i+1}`;
      return `<th style="padding: 4px; border: 1px solid #cbd5e1; font-size: 0.72rem; min-width: 26px; text-align: center;">${dLabel}</th>`;
    }).join('');

    const tablePresenceRows = students.map((st, sIdx) => {
      let presencasCount = 0;
      const cells = lessons.map(l => {
        const isPresent = l.attendance && l.attendance[st.id] === 'presente';
        if (isPresent) presencasCount++;
        const symbol = isPresent ? '•' : 'F';
        const color = isPresent ? '#059669' : '#dc2626';
        const bg = isPresent ? '#ffffff' : '#fee2e2';
        return `<td style="padding: 3px; border: 1px solid #cbd5e1; text-align: center; font-weight: 800; font-size: 0.76rem; background: ${bg}; color: ${color};">${symbol}</td>`;
      }).join('');

      const faltas = Math.max(0, lessons.length - presencasCount);
      const freqPct = lessons.length > 0 ? Math.round((presencasCount / lessons.length) * 100) : 100;

      return `
        <tr>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600;">${sIdx + 1}</td>
          <td style="padding: 4px 8px; border: 1px solid #cbd5e1; font-weight: 600;">
            ${this.app.escapeHTML(st.nome)}
            <span style="font-size: 0.7rem; color: #64748b; display: block;">RA: ${this.app.escapeHTML(st.ra || '-')}</span>
          </td>
          ${cells || `<td style="padding: 4px; text-align:center; color:#94a3b8;">Nenhuma aula registrada</td>`}
          <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: #059669;">${presencasCount}</td>
          <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: ${faltas > 0 ? '#dc2626' : '#64748b'};">${faltas}</td>
          <td style="padding: 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: 800;">${freqPct}%</td>
        </tr>
      `;
    }).join('');

    // Registro cronológico de aulas ministradas
    const lessonsLogHtml = lessons.map((l, i) => {
      const dataFormatted = l.data ? l.data.split('-').reverse().join('/') : '-';
      return `
        <tr>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700;">${i + 1}</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; white-space: nowrap;">${dataFormatted}</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: 600;">${this.app.escapeHTML(l.titulo || 'Aula Regular')}</td>
          <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 0.78rem; color: #334155;">${this.app.escapeHTML(l.conteudo || l.descricao || 'Conteúdo ministrado em conformidade com o plano de ensino.')}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #0f172a; line-height: 1.4; padding: 1.5cm 1cm; background: #ffffff;">
        <!-- Cabeçalho Oficial -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; font-size: 1.3rem; font-weight: 900; text-transform: uppercase; color: #0f172a;">
              ${this.app.escapeHTML(activeSchool.nome || 'Portal do Curso')}
            </h1>
            <p style="margin: 3px 0 0 0; font-size: 0.82rem; color: #475569;">
              Diário de Classe & Registro Oficial de Frequência e Conteúdo
            </p>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; padding: 4px 10px; background: #0f172a; color: #ffffff; border-radius: 4px; font-weight: 800; font-size: 0.76rem; letter-spacing: 0.5px;">
              DIÁRIO OFICIAL DOCENTE
            </div>
            <div style="font-size: 0.74rem; color: #64748b; margin-top: 4px;">Ano Letivo: ${new Date().getFullYear()}</div>
          </div>
        </div>

        <!-- Identificação da Disciplina e Turma -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; font-size: 0.84rem;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 8px;">
            <div><strong>Disciplina:</strong> ${this.app.escapeHTML(discipline.nome)} (${this.app.escapeHTML(discipline.code || '-')})</div>
            <div><strong>Carga Horária:</strong> ${discipline.workload || 40} horas</div>
            <div><strong>Total de Aulas:</strong> ${lessons.length} aulas</div>
          </div>
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px;">
            <div><strong>Curso / Turma:</strong> ${course ? this.app.escapeHTML(course.name) : 'Geral'} • ${this.app.escapeHTML(turma.nome)}</div>
            <div><strong>Professor(a):</strong> ${this.app.escapeHTML(teacherName)}</div>
            <div><strong>Alunos Enturmados:</strong> ${students.length} alunos</div>
          </div>
        </div>

        <!-- Seção 1: Registro de Frequência (Chamada) -->
        <h3 style="font-size: 0.95rem; font-weight: 800; margin: 0 0 10px 0; text-transform: uppercase; color: #0f172a;">
          1. Folha de Presença & Frequência dos Alunos
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 25px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 30px;">#</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; min-width: 180px;">Aluno(a) / RA</th>
              ${tablePresenceHeader || '<th style="padding: 6px; border: 1px solid #cbd5e1;">Aulas</th>'}
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 32px; color: #059669;">P</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 32px; color: #dc2626;">F</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 45px;">%</th>
            </tr>
          </thead>
          <tbody>
            ${tablePresenceRows || `<tr><td colspan="6" style="text-align:center; padding: 15px; color:#64748b;">Nenhum aluno enturmado.</td></tr>`}
          </tbody>
        </table>

        <!-- Seção 2: Registro de Conteúdos Ministrados -->
        <h3 style="font-size: 0.95rem; font-weight: 800; margin: 20px 0 10px 0; text-transform: uppercase; color: #0f172a;">
          2. Registro Cronológico de Conteúdos e Aulas Ministradas
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 30px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 30px;">Aula</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; width: 85px;">Data</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: left; width: 220px;">Título / Tema</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: left;">Conteúdo Programático & Atividades Desenvolvidas</th>
            </tr>
          </thead>
          <tbody>
            ${lessonsLogHtml || `<tr><td colspan="4" style="text-align:center; padding: 15px; color:#64748b;">Nenhuma aula registrada até o momento no diário.</td></tr>`}
          </tbody>
        </table>

        <!-- Assinatura do Professor e Coordenação -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center;">
          <div>
            <div style="border-top: 1px solid #0f172a; width: 85%; margin: 0 auto; padding-top: 5px;">
              <strong style="font-size: 0.8rem; display: block;">${this.app.escapeHTML(teacherName)}</strong>
              <span style="font-size: 0.72rem; color: #64748b;">Docente Responsável</span>
            </div>
          </div>
          <div>
            <div style="border-top: 1px solid #0f172a; width: 85%; margin: 0 auto; padding-top: 5px;">
              <strong style="font-size: 0.8rem; display: block;">Coordenação de Curso</strong>
              <span style="font-size: 0.72rem; color: #64748b;">Visto & Homologação</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.openReportPreviewModal('Diário de Classe Oficial', htmlContent);
  }

  /* =========================================================================
     3. MODAL DE PRÉ-VISUALIZAÇÃO & IMPRESSÃO
     ========================================================================= */
  openReportPreviewModal(title, htmlContent) {
    const previewBox = document.getElementById('document-preview-content');
    const modalTitle = document.querySelector('#modal-document-preview .modal-title');
    if (previewBox) {
      previewBox.innerHTML = htmlContent;
    }
    if (modalTitle) {
      modalTitle.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${this.app.escapeHTML(title)}`;
    }
    document.getElementById('modal-document-preview')?.classList.add('open');
  }
}
