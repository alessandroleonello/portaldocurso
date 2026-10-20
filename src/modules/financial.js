/**
 * financial.js - Módulo Financeiro (Mensalidades, Taxas, Pagamentos)
 * Portal do Curso
 */

export class FinancialModule {
  constructor(app) {
    this.app = app;
    this.selectedCourseId = null;
    this.selectedTurmaId = null;
    this.selectedMonth = new Date().toISOString().substring(0, 7); // 'YYYY-MM'
    this.searchQuery = '';
  }

  get state() {
    return this.app.state;
  }

  /* =========================================================================
     1. CONTROLE DE CICLO DO CURSO, TURMA & PARCELAS / COMPETÊNCIAS
     ========================================================================= */
  getCourseDurationMonths(course) {
    if (!course) return 12;
    const num = parseFloat(course.durationNum) || 1;
    const unit = course.durationUnit || 'Anos';
    if (unit === 'Anos') return Math.max(1, Math.round(num * 12));
    if (unit === 'Meses') return Math.max(1, Math.round(num));
    if (unit === 'Dias') return Math.max(1, Math.round(num / 30));
    return 12;
  }

  getTurmaCompetencias(turma, course) {
    if (!turma) return [];
    const crs = course || (this.state.courses || []).find(c => c.id === turma.courseId);
    const totalMonths = this.getCourseDurationMonths(crs);
    let startYear, startMonth;

    if (turma.mesInicio && turma.mesInicio.includes('-')) {
      const parts = turma.mesInicio.split('-').map(Number);
      startYear = parts[0];
      startMonth = parts[1];
    } else if (turma.criadoEm) {
      const d = new Date(turma.criadoEm);
      startYear = d.getFullYear();
      startMonth = d.getMonth() + 1;
    } else {
      const d = new Date();
      startYear = d.getFullYear();
      startMonth = d.getMonth() + 1;
    }

    const monthNames = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const fullMonthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const dueDay = parseInt(turma.diaVencimento, 10) || 10;
    const list = [];

    for (let i = 0; i < totalMonths; i++) {
      const targetDate = new Date(startYear, (startMonth - 1) + i, 1);
      const y = targetDate.getFullYear();
      const m = targetDate.getMonth() + 1;
      const mStr = String(m).padStart(2, '0');
      const key = `${y}-${mStr}`;
      const parcelaNum = i + 1;
      const label = `Parcela ${String(parcelaNum).padStart(2, '0')}/${String(totalMonths).padStart(2, '0')} (${monthNames[m]}/${y})`;
      const fullLabel = `${fullMonthNames[m]} de ${y}`;
      const dueDate = `${y}-${mStr}-${String(dueDay).padStart(2, '0')}`;
      const dueFormatted = `${String(dueDay).padStart(2, '0')}/${mStr}/${y}`;

      list.push({
        parcela: parcelaNum,
        totalParcelas: totalMonths,
        key,
        ano: y,
        mes: m,
        label,
        fullLabel,
        dueDate,
        dueFormatted
      });
    }

    return list;
  }

  /**
   * Calcula o valor da mensalidade de um aluno para uma competência/parcela específica, considerando:
   * 1. Bolsa contínua (aplicada a partir da parcela definida até o final do curso)
   * 2. Desconto pontual (aplicado exclusivamente naquela parcela específica)
   */
  calculateStudentInstallment(turma, studentId, compKey) {
    const baseValue = turma ? (parseFloat(turma.valorMensalidade) || 0) : 0;
    if (!turma) {
      return { baseValue: 0, finalValue: 0, totalDiscount: 0, bolsa: null, pontual: null, bolsaAmount: 0, pontualAmount: 0 };
    }

    // 1. Bolsa contínua
    const bolsa = (turma.studentBolsas && turma.studentBolsas[studentId]) 
      || (turma.studentDiscounts && turma.studentDiscounts[studentId]) 
      || null;

    let bolsaActive = false;
    let bolsaAmount = 0;

    if (bolsa) {
      // Se não tiver startMonthKey, assume que começou desde a 1ª parcela (legado)
      if (!bolsa.startMonthKey || !compKey || compKey >= bolsa.startMonthKey) {
        bolsaActive = true;
        if (bolsa.type === 'percent') {
          bolsaAmount = baseValue * ((parseFloat(bolsa.value) || 0) / 100);
        } else {
          bolsaAmount = Math.min(baseValue, parseFloat(bolsa.value) || 0);
        }
      }
    }

    // 2. Desconto pontual exclusivo desta competência
    const pontualKey = `${compKey}_${studentId}`;
    const pontual = (turma.parcelaDiscounts && turma.parcelaDiscounts[pontualKey]) || null;
    let pontualAmount = 0;

    if (pontual) {
      const baseAposBolsa = Math.max(0, baseValue - bolsaAmount);
      if (pontual.type === 'percent') {
        pontualAmount = baseAposBolsa * ((parseFloat(pontual.value) || 0) / 100);
      } else {
        pontualAmount = Math.min(baseAposBolsa, parseFloat(pontual.value) || 0);
      }
    }

    const totalDiscount = Math.min(baseValue, bolsaAmount + pontualAmount);
    const finalValue = Math.max(0, baseValue - totalDiscount);

    return {
      baseValue,
      finalValue,
      totalDiscount,
      bolsa: bolsaActive ? bolsa : null,
      bolsaRaw: bolsa,
      bolsaAmount,
      pontual,
      pontualAmount
    };
  }

  populateFilters() {
    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    const schoolCourses = (this.state.courses || []).filter(c => c.schoolId === activeSchool.id);
    const courseSelect = document.getElementById('financeiro-filter-curso');
    const turmaSelect = document.getElementById('financeiro-filter-turma');

    if (!courseSelect || !turmaSelect) return;

    // 1. Preencher Cursos
    if (schoolCourses.length === 0) {
      courseSelect.innerHTML = '<option value="">Nenhum curso cadastrado</option>';
      turmaSelect.innerHTML = '<option value="">Sem turmas disponíveis</option>';
      const mesSelect = document.getElementById('financeiro-filter-mes');
      if (mesSelect) mesSelect.innerHTML = '<option value="">Sem parcelas</option>';
      return;
    }

    const currentCourseVal = this.selectedCourseId || courseSelect.value;
    courseSelect.innerHTML = schoolCourses.map(c => 
      `<option value="${c.id}">${this.app.escapeHTML(c.code ? `${c.code} - ${c.name}` : c.name)}</option>`
    ).join('');

    if (currentCourseVal && schoolCourses.some(c => c.id === currentCourseVal)) {
      courseSelect.value = currentCourseVal;
      this.selectedCourseId = currentCourseVal;
    } else {
      this.selectedCourseId = schoolCourses[0].id;
      courseSelect.value = this.selectedCourseId;
    }

    // 2. Preencher Turmas do Curso Selecionado
    this.populateTurmasFilter();

    // 3. Preencher Parcelas da Turma Selecionada
    this.populateCompetenciasFilter();
  }

  populateTurmasFilter() {
    const activeSchool = this.app.getActiveSchool();
    const turmaSelect = document.getElementById('financeiro-filter-turma');
    if (!turmaSelect) return;

    const schoolTurmas = (this.state.classes || []).filter(t => 
      t.schoolId === activeSchool.id && (!this.selectedCourseId || t.courseId === this.selectedCourseId)
    );

    if (schoolTurmas.length === 0) {
      turmaSelect.innerHTML = '<option value="">Nenhuma turma neste curso</option>';
      this.selectedTurmaId = null;
      return;
    }

    turmaSelect.innerHTML = schoolTurmas.map(t => {
      const valMensal = t.valorMensalidade ? ` • R$ ${parseFloat(t.valorMensalidade).toFixed(2)}` : ' • S/ valor';
      const alunoCount = (t.studentIds || []).length;
      return `<option value="${t.id}">${this.app.escapeHTML(t.nome)} (${alunoCount} alunos${valMensal})</option>`;
    }).join('');

    if (this.selectedTurmaId && schoolTurmas.some(t => t.id === this.selectedTurmaId)) {
      turmaSelect.value = this.selectedTurmaId;
    } else {
      this.selectedTurmaId = schoolTurmas[0].id;
      turmaSelect.value = this.selectedTurmaId;
    }
  }

  populateCompetenciasFilter() {
    const mesSelect = document.getElementById('financeiro-filter-mes');
    if (!mesSelect) return;

    const currentTurma = (this.state.classes || []).find(t => t.id === this.selectedTurmaId);
    if (!currentTurma) {
      mesSelect.innerHTML = '<option value="">Selecione uma turma</option>';
      return;
    }

    const currentCourse = (this.state.courses || []).find(c => c.id === currentTurma.courseId);
    const competencias = this.getTurmaCompetencias(currentTurma, currentCourse);

    if (competencias.length === 0) {
      mesSelect.innerHTML = '<option value="">Nenhuma parcela calculada</option>';
      return;
    }

    mesSelect.innerHTML = competencias.map(comp => 
      `<option value="${comp.key}">${comp.label}</option>`
    ).join('');

    const exists = competencias.some(c => c.key === this.selectedMonth);
    if (exists) {
      mesSelect.value = this.selectedMonth;
    } else {
      const currentYearMonth = new Date().toISOString().substring(0, 7);
      const matchCurrent = competencias.find(c => c.key === currentYearMonth);
      if (matchCurrent) {
        this.selectedMonth = matchCurrent.key;
        mesSelect.value = matchCurrent.key;
      } else {
        this.selectedMonth = competencias[0].key;
        mesSelect.value = competencias[0].key;
      }
    }
  }

  handleFinancialCourseChange() {
    const courseSelect = document.getElementById('financeiro-filter-curso');
    if (courseSelect) {
      this.selectedCourseId = courseSelect.value;
      this.populateTurmasFilter();
      this.populateCompetenciasFilter();
      this.renderFinanceiroTable();
    }
  }

  handleFinancialTurmaChange() {
    const turmaSelect = document.getElementById('financeiro-filter-turma');
    if (turmaSelect) {
      this.selectedTurmaId = turmaSelect.value;
      this.populateCompetenciasFilter();
      this.renderFinanceiroTable();
    }
  }

  handleFinancialMonthChange() {
    const mesInput = document.getElementById('financeiro-filter-mes');
    if (mesInput && mesInput.value) {
      this.selectedMonth = mesInput.value;
      this.renderFinanceiroTable();
    }
  }

  handleFinancialSearch(e) {
    this.searchQuery = (e.target.value || '').trim().toLowerCase();
    this.renderFinanceiroTable();
  }

  /* =========================================================================
     2. RENDERIZAÇÃO DA TABELA FINANCEIRA E RESUMO
     ========================================================================= */
  renderFinanceiroTable() {
    const tbody = document.getElementById('table-financeiro-body');
    const thead = document.getElementById('table-financeiro-thead');
    const summaryContainer = document.getElementById('financeiro-turma-summary');
    const tableTitle = document.getElementById('financeiro-table-title');
    const tableSubtitle = document.getElementById('financeiro-table-subtitle');
    if (!tbody) return;

    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    // Garante preenchimento inicial dos filtros
    this.populateFilters();

    const searchInput = document.getElementById('financeiro-search-input');
    if (searchInput && document.activeElement !== searchInput) {
      searchInput.value = this.searchQuery || '';
    }

    const [ano, mes] = (this.selectedMonth || new Date().toISOString().substring(0, 7)).split('-');
    const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const monthLabel = `${monthNames[parseInt(mes, 10)] || mes} de ${ano}`;

    // -------------------------------------------------------------------------
    // CASO ALUNO: VISUALIZAÇÃO PRÓPRIA DE SUAS MENSALIDADES
    // -------------------------------------------------------------------------
    if (this.app.currentRole === 'aluno') {
      const alunoObj = (this.app.currentUser && this.app.currentUser.tipo === 'aluno')
        ? this.app.currentUser
        : this.state.users.find(u => u.tipo === 'aluno' && u.schoolId === activeSchool.id);

      if (tableTitle) tableTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Minhas Mensalidades & Contratos`;
      if (tableSubtitle) tableSubtitle.textContent = `Acompanhe seu plano de mensalidades, bolsas concedidas, código PIX e emita seus comprovantes de quitação.`;

      if (thead) {
        thead.innerHTML = `
          <tr>
            <th>Parcela / Competência</th>
            <th>Turma & Curso</th>
            <th>Vencimento</th>
            <th>Valor Base</th>
            <th>Bolsa / Desconto</th>
            <th>Valor a Pagar</th>
            <th>Status</th>
            <th style="text-align: right;">Ações / Pagamento</th>
          </tr>
        `;
      }

      if (!alunoObj) {
        if (summaryContainer) summaryContainer.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum perfil de aluno ativo no momento.</td></tr>`;
        return;
      }

      // Localizar turmas matriculadas do aluno
      const studentTurmas = (this.state.classes || []).filter(t => 
        t.schoolId === activeSchool.id && (
          (t.studentIds || []).includes(alunoObj.id) ||
          t.id === alunoObj.turmaId ||
          (alunoObj.cursoId && t.courseId === alunoObj.cursoId)
        )
      );

      // Calcular KPIs globais e compilar todas as parcelas das turmas do aluno
      let totalQuitado = 0;
      let totalEmAberto = 0;
      let countPagas = 0;
      let countPendentes = 0;
      let proximoVencimentoFormatted = 'Em dia';
      let proximoVencimentoSubtext = 'Nenhuma pendência';
      let nextDueTimestamp = Infinity;
      const today = new Date();

      const allInstallmentItems = [];

      studentTurmas.forEach(turma => {
        const course = (this.state.courses || []).find(c => c.id === turma.courseId);
        const competencias = this.getTurmaCompetencias(turma, course);
        const dueDay = parseInt(turma.diaVencimento, 10) || 10;

        competencias.forEach(comp => {
          const calc = this.calculateStudentInstallment(turma, alunoObj.id, comp.key);
          const paymentKey = `${comp.key}_${alunoObj.id}`;
          const isPaid = (turma.payments && turma.payments[paymentKey] && turma.payments[paymentKey].status === 'Pago')
            || (this.state.financial || []).some(f => f.studentId === alunoObj.id && f.schoolId === activeSchool.id && f.dueDate && f.dueDate.startsWith(comp.key) && f.status === 'Pago');

          const [yNum, mNum] = comp.key.split('-').map(Number);
          const dueDateObj = new Date(yNum, mNum - 1, dueDay, 23, 59, 59);
          const isAtrasado = !isPaid && (today > dueDateObj);

          if (isPaid) {
            totalQuitado += calc.finalValue;
            countPagas++;
          } else {
            totalEmAberto += calc.finalValue;
            countPendentes++;
            if (dueDateObj.getTime() < nextDueTimestamp) {
              nextDueTimestamp = dueDateObj.getTime();
              proximoVencimentoFormatted = comp.dueFormatted;
              proximoVencimentoSubtext = isAtrasado ? `⚠️ Vencida (R$ ${calc.finalValue.toFixed(2)})` : `R$ ${calc.finalValue.toFixed(2)}`;
            }
          }

          allInstallmentItems.push({
            turma,
            course,
            comp,
            calc,
            isPaid,
            isAtrasado,
            dueDateObj
          });
        });
      });

      // Renderizar KPIs do Aluno no resumo
      if (summaryContainer) {
        summaryContainer.innerHTML = `
          <div class="grid-4" style="gap: 1rem;">
            <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
              <div class="stat-icon indigo" style="width: 40px; height: 40px; font-size: 1.1rem;">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div class="stat-details">
                <h3 style="font-size: 0.78rem;">Minhas Turmas</h3>
                <div class="value" style="font-size: 1.25rem;">${studentTurmas.length} <small style="font-size: 0.78rem; font-weight: 400; color: var(--text-muted);">ativa(s)</small></div>
                <div class="subtext" style="font-size: 0.72rem; color: var(--primary);">Matrícula regular</div>
              </div>
            </div>

            <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
              <div class="stat-icon emerald" style="width: 40px; height: 40px; font-size: 1.1rem;">
                <i class="fa-solid fa-circle-check"></i>
              </div>
              <div class="stat-details">
                <h3 style="font-size: 0.78rem;">Total Quitado</h3>
                <div class="value" style="font-size: 1.25rem; color: #059669;">R$ ${totalQuitado.toFixed(2)}</div>
                <div class="subtext" style="font-size: 0.72rem;">${countPagas} parcela(s) paga(s)</div>
              </div>
            </div>

            <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
              <div class="stat-icon amber" style="width: 40px; height: 40px; font-size: 1.1rem;">
                <i class="fa-solid fa-clock"></i>
              </div>
              <div class="stat-details">
                <h3 style="font-size: 0.78rem;">Total em Aberto</h3>
                <div class="value" style="font-size: 1.25rem; color: #d97706;">R$ ${totalEmAberto.toFixed(2)}</div>
                <div class="subtext" style="font-size: 0.72rem;">${countPendentes} parcela(s) restante(s)</div>
              </div>
            </div>

            <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
              <div class="stat-icon sky" style="width: 40px; height: 40px; font-size: 1.1rem;">
                <i class="fa-solid fa-calendar-check"></i>
              </div>
              <div class="stat-details">
                <h3 style="font-size: 0.78rem;">Próximo Vencimento</h3>
                <div class="value" style="font-size: 1.25rem; color: var(--text-main);">${proximoVencimentoFormatted}</div>
                <div class="subtext" style="font-size: 0.72rem; color: var(--primary);">${proximoVencimentoSubtext}</div>
              </div>
            </div>
          </div>
        `;
      }

      if (studentTurmas.length === 0 || allInstallmentItems.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
              <i class="fa-solid fa-graduation-cap" style="font-size: 2rem; opacity: 0.4; margin-bottom: 0.5rem; display: block;"></i>
              Você não possui mensalidades ou turmas cadastradas no momento.
            </td>
          </tr>
        `;
        return;
      }

      let displayedItems = allInstallmentItems;
      if (this.searchQuery) {
        const q = this.searchQuery;
        displayedItems = displayedItems.filter(item => {
          const tName = (item.turma.nome || '').toLowerCase();
          const cName = item.course ? (item.course.name || '').toLowerCase() : '';
          const compLabel = (item.comp.label || '').toLowerCase();
          const compFull = (item.comp.fullLabel || '').toLowerCase();
          const statusStr = item.isPaid ? 'pago' : (item.isAtrasado ? 'atrasado' : 'pendente');
          return tName.includes(q) || cName.includes(q) || compLabel.includes(q) || compFull.includes(q) || statusStr.includes(q);
        });
      }

      if (displayedItems.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">
              Nenhuma parcela encontrada para a busca "${this.app.escapeHTML(this.searchQuery)}".
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = displayedItems.map(item => {
        const { turma, course, comp, calc, isPaid, isAtrasado } = item;
        const badgeClass = isPaid ? 'badge-success' : (isAtrasado ? 'badge-danger' : 'badge-warning');
        const statusLabel = isPaid ? 'Pago' : (isAtrasado ? 'Atrasada' : 'Pendente');
        const statusIcon = isPaid ? 'fa-circle-check' : (isAtrasado ? 'fa-triangle-exclamation' : 'fa-clock');

        // Detalhes da bolsa / desconto
        let discDetailsHtml = '';
        if (calc.bolsa || calc.pontual) {
          discDetailsHtml = '<div style="display:flex; flex-direction:column; gap:3px;">';
          if (calc.bolsa) {
            const pctOrFix = calc.bolsa.type === 'percent' ? `${calc.bolsa.value}%` : `R$ ${parseFloat(calc.bolsa.value).toFixed(2)}`;
            discDetailsHtml += `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #059669; font-weight: 700;"><i class="fa-solid fa-graduation-cap"></i> Bolsa ${pctOrFix} (-R$ ${calc.bolsaAmount.toFixed(2)})</span>`;
          }
          if (calc.pontual) {
            const pPctOrFix = calc.pontual.type === 'percent' ? `${calc.pontual.value}%` : `R$ ${parseFloat(calc.pontual.value).toFixed(2)}`;
            discDetailsHtml += `<span class="badge" style="background: rgba(99, 102, 241, 0.12); color: var(--primary); font-weight: 700;"><i class="fa-solid fa-tag"></i> Desconto: -R$ ${calc.pontualAmount.toFixed(2)} (${pPctOrFix})</span>`;
          }
          discDetailsHtml += '</div>';
        } else {
          discDetailsHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Valor integral</span>`;
        }

        return `
          <tr style="${isPaid ? 'opacity: 0.88;' : ''}">
            <td>
              <strong style="color: var(--primary);">Parcela ${String(comp.parcela).padStart(2, '0')}/${String(comp.totalParcelas).padStart(2, '0')}</strong><br>
              <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 600;">${comp.fullLabel}</span>
            </td>
            <td>
              <strong>${this.app.escapeHTML(turma.nome)}</strong><br>
              <span style="font-size: 0.8rem; color: var(--text-muted);">${course ? this.app.escapeHTML(course.name) : 'Geral'}</span>
            </td>
            <td>
              <span style="font-weight: 600;">${comp.dueFormatted}</span>
            </td>
            <td>R$ ${calc.baseValue.toFixed(2)}</td>
            <td>${discDetailsHtml}</td>
            <td>
              <strong style="color: var(--primary); font-size: 1.05rem;">R$ ${calc.finalValue.toFixed(2)}</strong>
            </td>
            <td>
              <span class="badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
                ${isPaid 
                  ? `<button type="button" class="btn btn-secondary btn-sm" onclick="app.generateDocument('quitacao')" title="Emitir Recibo de Quitação"><i class="fa-solid fa-receipt"></i> Recibo</button>` 
                  : `<button type="button" class="btn btn-primary btn-sm" onclick="app.openPixModal('${turma.id}', '${alunoObj.id}', '${comp.key}')" title="Visualizar Código PIX e QR Code para pagamento"><i class="fa-brands fa-pix"></i> Pagar c/ PIX</button>`}
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.openStudentCarneModal('${turma.id}', '${alunoObj.id}')" title="Visualizar Extrato e Carnê Completo da Turma"><i class="fa-solid fa-file-lines"></i> Carnê</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      return;
    }

    // -------------------------------------------------------------------------
    // CASO GESTÃO & SECRETARIA: VISUALIZAÇÃO POR CURSO E TURMA
    // -------------------------------------------------------------------------
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Aluno (RA)</th>
          <th>Valor Base da Turma</th>
          <th>Bolsa / Desconto</th>
          <th>Valor Líquido</th>
          <th>Vencimento</th>
          <th>Status</th>
          <th style="text-align: right;">Ações & Baixa</th>
        </tr>
      `;
    }

    const currentTurma = (this.state.classes || []).find(t => t.id === this.selectedTurmaId);

    if (!currentTurma) {
      if (summaryContainer) summaryContainer.innerHTML = '';
      if (tableTitle) tableTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Mensalidades dos Alunos`;
      if (tableSubtitle) tableSubtitle.textContent = `Selecione um curso e uma turma para gerenciar as mensalidades.`;
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
            <i class="fa-solid fa-layer-group" style="font-size: 2rem; opacity: 0.35; margin-bottom: 0.5rem; display: block;"></i>
            Nenhuma turma selecionada ou cadastrada para este curso.
          </td>
        </tr>
      `;
      return;
    }

    const baseValue = parseFloat(currentTurma.valorMensalidade) || 0;
    const dueDay = parseInt(currentTurma.diaVencimento, 10) || 10;
    const dueFormatted = `${String(dueDay).padStart(2, '0')}/${mes}/${ano}`;
    const studentIds = currentTurma.studentIds || [];
    const currentCourse = (this.state.courses || []).find(c => c.id === currentTurma.courseId);
    const competencias = this.getTurmaCompetencias(currentTurma, currentCourse);
    const currentComp = competencias.find(c => c.key === this.selectedMonth);

    // Carregar todos os alunos matriculados
    const allEnrolledStudents = (this.state.users || []).filter(u => 
      u.tipo === 'aluno' && studentIds.includes(u.id)
    ).sort((a, b) => a.nome.localeCompare(b.nome));

    // Cálculos de Resumo / KPIs da turma inteira
    let totalBruto = 0;
    let totalDescontos = 0;
    let totalLiquido = 0;
    let totalPago = 0;
    let totalPendente = 0;
    let countPago = 0;
    let countPendente = 0;

    allEnrolledStudents.forEach(st => {
      const calc = this.calculateStudentInstallment(currentTurma, st.id, this.selectedMonth);
      totalBruto += calc.baseValue;
      totalDescontos += calc.totalDiscount;
      const finalValue = calc.finalValue;
      totalLiquido += finalValue;

      const paymentKey = `${this.selectedMonth}_${st.id}`;
      const isPaid = currentTurma.payments && currentTurma.payments[paymentKey] && currentTurma.payments[paymentKey].status === 'Pago';
      if (isPaid) {
        totalPago += finalValue;
        countPago++;
      } else {
        totalPendente += finalValue;
        countPendente++;
      }
    });

    // Filtrar por busca (Nome, RA, Email, CPF)
    let enrolledStudents = allEnrolledStudents;
    if (this.searchQuery) {
      const q = this.searchQuery;
      enrolledStudents = enrolledStudents.filter(st => {
        const nome = (st.nome || '').toLowerCase();
        const ra = (st.ra || '').toLowerCase();
        const email = (st.email || '').toLowerCase();
        const cpf = (st.cpf || '').replace(/\D/g, '');
        const qClean = q.replace(/\D/g, '');
        return nome.includes(q) || ra.includes(q) || email.includes(q) || (qClean && cpf.includes(qClean)) || (st.cpf || '').toLowerCase().includes(q);
      });
    }

    if (tableTitle) {
      tableTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> Mensalidades: ${this.app.escapeHTML(currentTurma.nome)}`;
    }
    if (tableSubtitle) {
      const parcelaText = currentComp 
        ? `<strong>Parcela ${String(currentComp.parcela).padStart(2, '0')}/${String(currentComp.totalParcelas).padStart(2, '0')}</strong> • Competência: <strong>${currentComp.fullLabel}</strong>`
        : `Competência: <strong>${monthLabel}</strong>`;
      const searchInfo = this.searchQuery 
        ? ` • Filtrados: <strong>${enrolledStudents.length}</strong> de ${allEnrolledStudents.length}` 
        : ` • Alunos enturmados: <strong>${studentIds.length}</strong>`;
      tableSubtitle.innerHTML = `${parcelaText} • Vencimento padrão: todo dia <strong>${dueDay}</strong>${searchInfo}`;
    }

    const rowsHtml = enrolledStudents.map(st => {
      const calc = this.calculateStudentInstallment(currentTurma, st.id, this.selectedMonth);
      const finalValue = calc.finalValue;

      const hasBolsa = !!calc.bolsa;
      const hasPontual = !!calc.pontual;

      let discTagHtml = '';
      if (hasBolsa || hasPontual) {
        discTagHtml = '<div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">';
        if (hasBolsa) {
          const bLabel = calc.bolsa.type === 'percent' ? `${calc.bolsa.value}%` : `R$ ${parseFloat(calc.bolsa.value).toFixed(2)}`;
          discTagHtml += `
            <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-graduation-cap"></i> Bolsa ${bLabel} (-R$ ${calc.bolsaAmount.toFixed(2)})
            </span>
            ${calc.bolsa.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${this.app.escapeHTML(calc.bolsa.description)}</div>` : ''}
          `;
        }
        if (hasPontual) {
          const pLabel = calc.pontual.type === 'percent' ? `${calc.pontual.value}%` : `R$ ${parseFloat(calc.pontual.value).toFixed(2)}`;
          discTagHtml += `
            <span class="badge" style="background: rgba(99, 102, 241, 0.12); color: var(--primary); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-tag"></i> Desconto: -R$ ${calc.pontualAmount.toFixed(2)} (${pLabel})
            </span>
            ${calc.pontual.description ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${this.app.escapeHTML(calc.pontual.description)}</div>` : ''}
          `;
        }
        discTagHtml += '</div>';
      } else {
        discTagHtml = `<span style="font-size: 0.82rem; color: var(--text-muted);">Sem bolsa ou desconto</span>`;
      }

      // Verificar status de pagamento do mês
      const paymentKey = `${this.selectedMonth}_${st.id}`;
      const isPaid = currentTurma.payments && currentTurma.payments[paymentKey] && currentTurma.payments[paymentKey].status === 'Pago';

      const isAtrasado = !isPaid && (new Date() > new Date(parseInt(ano, 10), parseInt(mes, 10) - 1, dueDay, 23, 59, 59));
      const badgeClass = isPaid ? 'badge-success' : (isAtrasado ? 'badge-danger' : 'badge-warning');
      const statusLabel = isPaid ? 'Pago' : (isAtrasado ? 'Atrasado' : 'Pendente');

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-main);">${this.app.escapeHTML(st.nome)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
              RA: <span class="ra-badge">${this.app.escapeHTML(st.ra || 'S/ RA')}</span>
              ${st.email ? ` • <span>${this.app.escapeHTML(st.email)}</span>` : ''}
            </div>
          </td>
          <td>R$ ${baseValue.toFixed(2)}</td>
          <td>
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
              ${discTagHtml}
              <div style="display: flex; gap: 5px; margin-top: 4px; flex-wrap: wrap;">
                <button type="button" 
                        class="btn btn-secondary btn-sm" 
                        onclick="app.openBolsaModal('${currentTurma.id}', '${st.id}', '${this.selectedMonth}')" 
                        title="Aplicar bolsa a partir desta parcela até o fim do curso" 
                        style="font-size: 0.72rem; padding: 2px 7px; border-style: dashed;">
                  <i class="fa-solid fa-graduation-cap"></i> ${hasBolsa ? 'Editar Bolsa' : 'Aplicar Bolsa'}
                </button>
                <button type="button" 
                        class="btn btn-secondary btn-sm" 
                        onclick="app.openDescontoPontualModal('${currentTurma.id}', '${st.id}', '${this.selectedMonth}')" 
                        title="Aplicar desconto pontual apenas nesta parcela" 
                        style="font-size: 0.72rem; padding: 2px 7px; border-style: dashed;">
                  <i class="fa-solid fa-tag"></i> ${hasPontual ? 'Editar Desconto' : 'Aplicar Desconto'}
                </button>
              </div>
            </div>
          </td>
          <td>
            <strong style="font-size: 1.05rem; color: var(--primary);">R$ ${finalValue.toFixed(2)}</strong>
          </td>
          <td>${dueFormatted}</td>
          <td>
            <span class="badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 4px;">
              <i class="fa-solid ${isPaid ? 'fa-circle-check' : (isAtrasado ? 'fa-triangle-exclamation' : 'fa-clock')}"></i>
              ${statusLabel}
            </span>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
              ${isAtrasado ? `
                <button type="button" 
                        class="btn btn-sm" 
                        style="background: #25D366; color: #ffffff; font-weight: 600;"
                        onclick="app.sendWhatsAppCobrança('${st.id}', '${currentTurma.id}', '${this.selectedMonth}')" 
                        title="Enviar mensagem amigável de cobrança via WhatsApp">
                  <i class="fa-brands fa-whatsapp"></i> Cobrar
                </button>
              ` : ''}
              <button type="button" 
                      class="btn ${isPaid ? 'btn-secondary' : 'btn-success'} btn-sm" 
                      onclick="app.toggleFinancialPayment('${currentTurma.id}', '${st.id}', '${this.selectedMonth}')" 
                      title="${isPaid ? 'Cancelar Baixa (Voltar para Pendente)' : 'Confirmar Recebimento e Dar Baixa'}">
                <i class="fa-solid ${isPaid ? 'fa-rotate-left' : 'fa-check'}"></i> ${isPaid ? 'Desfazer Baixa' : 'Dar Baixa'}
              </button>
              <button type="button" 
                      class="btn btn-secondary btn-sm" 
                      onclick="app.openStudentCarneModal('${currentTurma.id}', '${st.id}')" 
                      title="Ver Carnê Completo de todas as parcelas do curso">
                <i class="fa-solid fa-receipt"></i> Carnê
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Renderizar Cards de Resumo / KPIs da Turma
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="grid-4" style="gap: 0.85rem;">
          <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
            <div class="stat-icon sky" style="width: 40px; height: 40px; font-size: 1.1rem;">
              <i class="fa-solid fa-brazilian-real-sign"></i>
            </div>
            <div class="stat-details">
              <h3 style="font-size: 0.78rem;">Mensalidade Base</h3>
              <div class="value" style="font-size: 1.25rem;">R$ ${baseValue.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem;">Vencimento dia ${dueDay}</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
            <div class="stat-icon indigo" style="width: 40px; height: 40px; font-size: 1.1rem;">
              <i class="fa-solid fa-users"></i>
            </div>
            <div class="stat-details">
              <h3 style="font-size: 0.78rem;">Alunos & Bolsas</h3>
              <div class="value" style="font-size: 1.25rem;">${studentIds.length} <small style="font-size: 0.78rem; font-weight: 400; color: var(--text-muted);">aluno(s)</small></div>
              <div class="subtext" style="font-size: 0.72rem; color: #059669;">Bolsas: -R$ ${totalDescontos.toFixed(2)}</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
            <div class="stat-icon emerald" style="width: 40px; height: 40px; font-size: 1.1rem;">
              <i class="fa-solid fa-circle-check"></i>
            </div>
            <div class="stat-details">
              <h3 style="font-size: 0.78rem;">Total Recebido (Pago)</h3>
              <div class="value" style="font-size: 1.25rem; color: #059669;">R$ ${totalPago.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem;">${countPago} mensalidade(s) baixada(s)</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 1rem;">
            <div class="stat-icon amber" style="width: 40px; height: 40px; font-size: 1.1rem;">
              <i class="fa-solid fa-clock"></i>
            </div>
            <div class="stat-details">
              <h3 style="font-size: 0.78rem;">Total a Receber (Pendente)</h3>
              <div class="value" style="font-size: 1.25rem; color: #d97706;">R$ ${totalPendente.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem;">Previsão Líquida: R$ ${totalLiquido.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;
    }

    if (enrolledStudents.length === 0) {
      if (this.searchQuery) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding: 3rem 1.5rem; color: var(--text-muted);">
              <i class="fa-solid fa-magnifying-glass" style="font-size: 2.2rem; opacity: 0.35; margin-bottom: 0.75rem; display: block; color: var(--primary);"></i>
              <h4 style="font-size: 1.05rem; margin-bottom: 0.25rem; color: var(--text-main);">Nenhum aluno encontrado</h4>
              <p style="margin: 0 0 1rem 0; font-size: 0.88rem;">Não encontramos nenhum aluno correspondente a "<strong>${this.app.escapeHTML(this.searchQuery)}</strong>" nesta turma.</p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="const el = document.getElementById('financeiro-search-input'); if(el) el.value = ''; app.handleFinancialSearch({ target: { value: '' } });">
                <i class="fa-solid fa-times"></i> Limpar Filtro de Busca
              </button>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; padding: 3rem 1.5rem; color: var(--text-muted);">
              <i class="fa-solid fa-user-slash" style="font-size: 2.2rem; opacity: 0.4; margin-bottom: 0.75rem; display: block;"></i>
              <h4 style="font-size: 1.05rem; margin-bottom: 0.25rem; color: var(--text-main);">Nenhum aluno enturmado nesta turma</h4>
              <p style="margin: 0 0 1rem 0; font-size: 0.88rem;">Matricule os alunos na aba <strong>Turmas</strong> para visualizar as mensalidades geradas automaticamente.</p>
              <button type="button" class="btn btn-primary btn-sm" onclick="app.openEnrollmentModal('${currentTurma.id}')">
                <i class="fa-solid fa-user-plus"></i> Matricular Alunos na Turma
              </button>
            </td>
          </tr>
        `;
      }
    } else {
      tbody.innerHTML = rowsHtml;
    }
  }

  /* =========================================================================
     3. DAR BAIXA / ALTERNAR STATUS DE PAGAMENTO
     ========================================================================= */
  togglePaymentStatus(turmaId, studentId, monthKey) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'dar baixa em pagamentos')) return;

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) return;

    if (!turma.payments) turma.payments = {};
    const key = `${monthKey}_${studentId}`;
    const isCurrentlyPaid = turma.payments[key] && turma.payments[key].status === 'Pago';

    const student = (this.state.users || []).find(u => u.id === studentId);
    const calc = this.calculateStudentInstallment(turma, studentId, monthKey);
    const finalValue = calc.finalValue;

    if (isCurrentlyPaid) {
      // Reverter baixa para pendente
      delete turma.payments[key];
      this.app.showToast(`Baixa revertida para "${student ? student.nome : 'Aluno'}". Mensalidade agora está pendente.`, 'info');
    } else {
      // Registrar baixa de pagamento
      turma.payments[key] = {
        status: 'Pago',
        paidAt: new Date().toISOString(),
        amountPaid: finalValue,
        recordedBy: this.app.currentUser ? this.app.currentUser.id : null
      };

      // Espelhar em state.financial para manter compatibilidade com relatórios e comprovantes
      if (!this.state.financial) this.state.financial = [];
      const [ano, mes] = monthKey.split('-');
      const dueDay = parseInt(turma.diaVencimento, 10) || 10;
      const dueDate = `${ano}-${mes}-${String(dueDay).padStart(2, '0')}`;

      const existingFin = this.state.financial.find(f => 
        f.studentId === studentId && f.schoolId === turma.schoolId && f.dueDate === dueDate
      );

      if (existingFin) {
        existingFin.status = 'Pago';
        existingFin.value = finalValue;
      } else {
        this.state.financial.push({
          id: 'fin_' + Date.now(),
          schoolId: turma.schoolId,
          studentId,
          turmaId: turma.id,
          description: `Mensalidade ${mes}/${ano} - ${turma.nome}`,
          value: finalValue,
          dueDate,
          status: 'Pago',
          criadoEm: new Date().toISOString()
        });
      }

      this.app.showToast(`Pagamento de R$ ${finalValue.toFixed(2)} baixado com sucesso para "${student ? student.nome : 'Aluno'}"!`, 'success');
    }

    turma.atualizadoEm = new Date().toISOString();
    this.app.saveState();
    this.renderFinanceiroTable();

    // Se o modal do carnê estiver aberto, atualiza-o em tempo real
    const carneModal = document.getElementById('modal-student-carne');
    if (carneModal && carneModal.classList.contains('open')) {
      this.openStudentCarneModal(turmaId, studentId);
    }
  }

  /* =========================================================================
     3.1 CARNÊ & EXTRATO COMPLETO DE MENSALIDADES DO CURSO
     ========================================================================= */
  openStudentCarneModal(turmaId, studentId) {
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    const student = (this.state.users || []).find(u => u.id === studentId);
    if (!turma || !student) {
      this.app.showToast('Dados da turma ou do aluno não encontrados.', 'error');
      return;
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const competencias = this.getTurmaCompetencias(turma, course);
    const baseValue = parseFloat(turma.valorMensalidade) || 0;
    const dueDay = parseInt(turma.diaVencimento, 10) || 10;

    // Bolsa contínua cadastrada do Aluno
    const bolsaObj = (turma.studentBolsas && turma.studentBolsas[student.id])
      || (turma.studentDiscounts && turma.studentDiscounts[student.id])
      || null;

    let bolsaResumoText = 'Nenhuma bolsa contínua ativa';
    if (bolsaObj) {
      const bVal = bolsaObj.type === 'percent' ? `${bolsaObj.value}%` : `R$ ${parseFloat(bolsaObj.value).toFixed(2)}`;
      const startComp = competencias.find(c => c.key === bolsaObj.startMonthKey);
      const startText = startComp ? `a partir da Parcela ${startComp.parcela} (${startComp.fullLabel})` : 'desde o início do curso';
      bolsaResumoText = `Bolsa de ${bVal} (${startText}) ${bolsaObj.description ? `• ${this.app.escapeHTML(bolsaObj.description)}` : ''}`;
    }

    // Totais e KPIs do Contrato calculando parcela a parcela
    let totalContrato = 0;
    let totalPago = 0;
    let parcelasPagas = 0;

    competencias.forEach(comp => {
      const calc = this.calculateStudentInstallment(turma, student.id, comp.key);
      totalContrato += calc.finalValue;

      const paymentKey = `${comp.key}_${student.id}`;
      const isPaid = (turma.payments && turma.payments[paymentKey] && turma.payments[paymentKey].status === 'Pago')
        || (this.state.financial || []).some(f => f.studentId === student.id && f.schoolId === turma.schoolId && f.dueDate && f.dueDate.startsWith(comp.key) && f.status === 'Pago');
      if (isPaid) {
        totalPago += calc.finalValue;
        parcelasPagas++;
      }
    });

    const totalPendente = Math.max(0, totalContrato - totalPago);
    const pctConcluido = totalContrato > 0 ? Math.round((totalPago / totalContrato) * 100) : 0;

    // Cabeçalho e resumo do aluno
    const infoContainer = document.getElementById('carne-student-info');
    if (infoContainer) {
      infoContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-user-graduate" style="color: var(--primary);"></i> ${this.app.escapeHTML(student.nome)}
              <span class="ra-badge">${this.app.escapeHTML(student.ra || 'S/ RA')}</span>
            </div>
            <div style="font-size: 0.86rem; color: var(--text-muted); margin-top: 5px;">
              Curso: <strong>${course ? this.app.escapeHTML(course.name) : 'Geral'}</strong> • 
              Turma: <strong>${this.app.escapeHTML(turma.nome)}</strong> • 
              Vencimento: todo dia <strong>${dueDay}</strong>
            </div>
            <div style="font-size: 0.82rem; color: #059669; font-weight: 600; margin-top: 4px;">
              <i class="fa-solid fa-graduation-cap"></i> ${bolsaResumoText}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.76rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Mensalidade Base</div>
            <div style="font-size: 1.45rem; font-weight: 800; color: var(--primary);">R$ ${baseValue.toFixed(2)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Total Previsto: R$ ${totalContrato.toFixed(2)}</div>
          </div>
        </div>

        <div class="grid-4" style="gap: 0.75rem; margin-top: 1rem;">
          <div style="padding: 0.75rem; background: var(--bg-main); border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Duração / Parcelas</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-main);">${competencias.length} parcelas</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-main); border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Total Quitado</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #059669;">R$ ${totalPago.toFixed(2)} <small style="font-size: 0.72rem; font-weight: 400;">(${parcelasPagas} pagas)</small></div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-main); border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Saldo Devedor</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: #d97706;">R$ ${totalPendente.toFixed(2)}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-main); border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Quitação do Curso</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">${pctConcluido}% concluído</div>
          </div>
        </div>
      `;
    }

    // Preencher linhas da tabela de parcelas
    const tbody = document.getElementById('table-carne-body');
    if (tbody) {
      const isStaff = this.app.hasRole ? this.app.hasRole('gestao', 'secretaria') : ['gestao', 'secretaria'].includes(this.app.currentRole);
      const today = new Date();

      tbody.innerHTML = competencias.map(comp => {
        const calc = this.calculateStudentInstallment(turma, student.id, comp.key);
        const finalValue = calc.finalValue;

        const paymentKey = `${comp.key}_${student.id}`;
        const paymentRecord = turma.payments ? turma.payments[paymentKey] : null;
        const isPaid = (paymentRecord && paymentRecord.status === 'Pago')
          || (this.state.financial || []).some(f => f.studentId === student.id && f.schoolId === turma.schoolId && f.dueDate && f.dueDate.startsWith(comp.key) && f.status === 'Pago');

        const [yNum, mNum] = comp.key.split('-').map(Number);
        const isAtrasado = !isPaid && (today > new Date(yNum, mNum - 1, dueDay, 23, 59, 59));
        const badgeClass = isPaid ? 'badge-success' : (isAtrasado ? 'badge-danger' : 'badge-warning');
        const statusLabel = isPaid ? 'Pago' : (isAtrasado ? 'Atrasado' : 'Pendente');
        const statusIcon = isPaid ? 'fa-circle-check' : (isAtrasado ? 'fa-triangle-exclamation' : 'fa-clock');

        // Detalhes da bolsa / desconto desta parcela
        let discHtml = '';
        if (calc.bolsa || calc.pontual) {
          discHtml = '<div style="display:flex; flex-direction:column; gap:2px;">';
          if (calc.bolsa) {
            const bLabel = calc.bolsa.type === 'percent' ? `${calc.bolsa.value}%` : `R$ ${parseFloat(calc.bolsa.value).toFixed(2)}`;
            discHtml += `<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.72rem; font-weight: 700;"><i class="fa-solid fa-graduation-cap"></i> Bolsa ${bLabel}</span>`;
          }
          if (calc.pontual) {
            const pLabel = calc.pontual.type === 'percent' ? `${calc.pontual.value}%` : `R$ ${parseFloat(calc.pontual.value).toFixed(2)}`;
            discHtml += `<span class="badge" style="background: rgba(99, 102, 241, 0.12); color: var(--primary); font-size: 0.72rem; font-weight: 700;"><i class="fa-solid fa-tag"></i> Desconto: -R$ ${calc.pontualAmount.toFixed(2)}</span>`;
          }
          discHtml += '</div>';
        } else {
          discHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">-</span>`;
        }

        let actionHtml = '';
        if (isStaff) {
          actionHtml = `
            <div style="display: flex; gap: 4px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
              <button type="button" 
                      class="btn ${isPaid ? 'btn-secondary' : 'btn-success'} btn-sm" 
                      onclick="app.toggleFinancialPayment('${turma.id}', '${student.id}', '${comp.key}')" 
                      style="font-size: 0.74rem; padding: 2px 7px;"
                      title="${isPaid ? 'Reverter Baixa' : 'Confirmar Recebimento e Dar Baixa'}">
                <i class="fa-solid ${isPaid ? 'fa-rotate-left' : 'fa-check'}"></i> ${isPaid ? 'Desfazer' : 'Baixar'}
              </button>
              <button type="button" 
                      class="btn btn-secondary btn-sm" 
                      onclick="app.openBolsaModal('${turma.id}', '${student.id}', '${comp.key}')" 
                      style="font-size: 0.74rem; padding: 2px 7px;" 
                      title="Aplicar bolsa a partir desta parcela até o fim do curso">
                <i class="fa-solid fa-graduation-cap"></i> Bolsa
              </button>
              <button type="button" 
                      class="btn btn-secondary btn-sm" 
                      onclick="app.openDescontoPontualModal('${turma.id}', '${student.id}', '${comp.key}')" 
                      style="font-size: 0.74rem; padding: 2px 7px;" 
                      title="Aplicar desconto pontual apenas nesta parcela">
                <i class="fa-solid fa-tag"></i> Desconto
              </button>
            </div>
          `;
        } else {
          actionHtml = isPaid
            ? `<button class="btn btn-secondary btn-sm" onclick="app.generateDocument('quitacao')" style="font-size: 0.75rem; padding: 3px 8px;"><i class="fa-solid fa-receipt"></i> Recibo</button>`
            : `<button class="btn btn-primary btn-sm" onclick="app.openPixModal('${turma.id}', '${student.id}', '${comp.key}')" style="font-size: 0.75rem; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-brands fa-pix"></i> Pagar c/ PIX</button>`;
        }

        return `
          <tr style="${isPaid ? 'opacity: 0.85;' : ''}">
            <td><strong style="color: var(--primary);">Parcela ${String(comp.parcela).padStart(2, '0')}/${String(comp.totalParcelas).padStart(2, '0')}</strong></td>
            <td><strong>${comp.fullLabel}</strong></td>
            <td>${comp.dueFormatted}</td>
            <td>R$ ${baseValue.toFixed(2)}</td>
            <td>${discHtml}</td>
            <td><strong style="color: var(--text-main); font-size: 0.95rem;">R$ ${finalValue.toFixed(2)}</strong></td>
            <td>
              <span class="badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
              </span>
            </td>
            <td style="text-align: right;">${actionHtml}</td>
          </tr>
        `;
      }).join('');
    }

    document.getElementById('modal-student-carne')?.classList.add('open');
  }

  /* =========================================================================
     4. GESTÃO DE BOLSAS (CONTÍNUAS) & DESCONTOS PONTUAIS
     ========================================================================= */
  openBolsaModal(turmaId, studentId, monthKey) {
    this.openDiscountModal(turmaId, studentId, monthKey || this.selectedMonth, 'bolsa');
  }

  openDescontoPontualModal(turmaId, studentId, monthKey) {
    this.openDiscountModal(turmaId, studentId, monthKey || this.selectedMonth, 'desconto');
  }

  openDiscountModal(turmaId, studentId, monthKey = null, mode = 'bolsa') {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'gerenciar bolsas e descontos')) return;

    const currentMonthKey = monthKey || this.selectedMonth || new Date().toISOString().substring(0, 7);
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    const student = (this.state.users || []).find(u => u.id === studentId);
    if (!turma || !student) {
      this.app.showToast('Turma ou aluno não localizado.', 'error');
      return;
    }

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const competencias = this.getTurmaCompetencias(turma, course);
    const compObj = competencias.find(c => c.key === currentMonthKey) || { 
      parcela: 1, 
      totalParcelas: competencias.length || 1, 
      fullLabel: currentMonthKey 
    };

    const modeInput = document.getElementById('discount-mode');
    const turmaIdInput = document.getElementById('discount-turma-id');
    const studentIdInput = document.getElementById('discount-student-id');
    const monthKeyInput = document.getElementById('discount-month-key');

    if (modeInput) modeInput.value = mode;
    if (turmaIdInput) turmaIdInput.value = turma.id;
    if (studentIdInput) studentIdInput.value = student.id;
    if (monthKeyInput) monthKeyInput.value = currentMonthKey;

    const titleEl = document.getElementById('modal-discount-title');
    const descLabel = document.getElementById('discount-description-label');
    const descInput = document.getElementById('discount-description');
    const saveBtn = document.getElementById('btn-save-discount');
    const removeBtn = document.getElementById('btn-remove-discount');
    const baseValue = parseFloat(turma.valorMensalidade) || 0;

    let currentItem = null;
    if (mode === 'bolsa') {
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-graduation-cap" style="color: var(--primary);"></i> Conceder Bolsa de Estudos`;
      if (descLabel) descLabel.innerHTML = `<i class="fa-solid fa-pen"></i> Motivo / Nome da Bolsa`;
      if (descInput) descInput.placeholder = "Digite o motivo ou nome da bolsa (Ex: Bolsa Mérito, ProUni, Convênio)";
      if (saveBtn) saveBtn.textContent = 'Salvar Bolsa';
      currentItem = (turma.studentBolsas && turma.studentBolsas[student.id]) || (turma.studentDiscounts && turma.studentDiscounts[student.id]) || null;
    } else {
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-tag" style="color: var(--primary);"></i> Aplicar Desconto Pontual na Parcela`;
      if (descLabel) descLabel.innerHTML = `<i class="fa-solid fa-pen"></i> Motivo / Descrição do Desconto`;
      if (descInput) descInput.placeholder = "Digite o motivo do desconto (Ex: Pontualidade, Ajuste Especial)";
      if (saveBtn) saveBtn.textContent = 'Salvar Desconto Pontual';
      const pontualKey = `${currentMonthKey}_${student.id}`;
      currentItem = (turma.parcelaDiscounts && turma.parcelaDiscounts[pontualKey]) || null;
    }

    const infoEl = document.getElementById('discount-modal-student-info');
    if (infoEl) {
      const modeBanner = mode === 'bolsa'
        ? `<div style="margin-top: 6px; padding: 6px 10px; border-radius: 6px; background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.8rem; font-weight: 600;">
             <i class="fa-solid fa-circle-info"></i> <strong>Bolsa Contínua:</strong> Válida a partir da <strong>Parcela ${compObj.parcela || 1}/${compObj.totalParcelas || 1} (${compObj.fullLabel})</strong> até o fim do curso. As parcelas anteriores permanecem com o valor padrão.
           </div>`
        : `<div style="margin-top: 6px; padding: 6px 10px; border-radius: 6px; background: rgba(99, 102, 241, 0.12); color: var(--primary); font-size: 0.8rem; font-weight: 600;">
             <i class="fa-solid fa-circle-info"></i> <strong>Desconto Pontual:</strong> Válido <strong>exclusivamente para a Parcela ${compObj.parcela || 1}/${compObj.totalParcelas || 1} (${compObj.fullLabel})</strong>. Não altera as demais parcelas.
           </div>`;

      infoEl.innerHTML = `
        <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);"><i class="fa-solid fa-user-graduate" style="color: var(--primary);"></i> ${this.app.escapeHTML(student.nome)}</div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">
          RA: <span class="ra-badge">${this.app.escapeHTML(student.ra || 'S/ RA')}</span> • 
          Turma: <strong>${this.app.escapeHTML(turma.nome)}</strong> • 
          Mensalidade Base: <strong>R$ ${baseValue.toFixed(2)}</strong>
        </div>
        ${modeBanner}
      `;
    }

    const typeSelect = document.getElementById('discount-type');
    const valueInput = document.getElementById('discount-value');

    if (currentItem) {
      if (typeSelect) typeSelect.value = currentItem.type || 'percent';
      if (valueInput) valueInput.value = currentItem.value !== undefined ? currentItem.value : '';
      if (descInput) descInput.value = currentItem.description || '';
      if (removeBtn) {
        removeBtn.style.display = 'inline-flex';
        removeBtn.innerHTML = mode === 'bolsa' ? '<i class="fa-solid fa-trash"></i> Remover Bolsa' : '<i class="fa-solid fa-trash"></i> Remover Desconto Desta Parcela';
      }
    } else {
      if (typeSelect) typeSelect.value = 'percent';
      if (valueInput) valueInput.value = '';
      if (descInput) descInput.value = '';
      if (removeBtn) removeBtn.style.display = 'none';
    }

    this.updateDiscountPreview();
    document.getElementById('modal-financial-discount')?.classList.add('open');
  }

  updateDiscountPreview() {
    const mode = document.getElementById('discount-mode')?.value || 'bolsa';
    const turmaId = document.getElementById('discount-turma-id')?.value;
    const type = document.getElementById('discount-type')?.value || 'percent';
    const valueNum = parseFloat(document.getElementById('discount-value')?.value) || 0;
    const previewEl = document.getElementById('discount-live-preview');
    if (!previewEl) return;

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    const baseValue = turma ? (parseFloat(turma.valorMensalidade) || 0) : 0;

    let discAmount = 0;
    if (type === 'percent') {
      discAmount = baseValue * (Math.min(100, Math.max(0, valueNum)) / 100);
    } else {
      discAmount = Math.min(baseValue, Math.max(0, valueNum));
    }

    const finalValue = Math.max(0, baseValue - discAmount);
    const labelContext = mode === 'bolsa'
      ? 'Valor a partir da parcela selecionada até o fim do curso'
      : 'Valor líquido exclusivamente nesta parcela';

    previewEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div>
          <span style="font-size: 0.8rem; color: var(--text-muted); display: block;">Simulação do Valor Líquido:</span>
          <span style="font-size: 0.88rem; color: var(--text-main);">
            Valor Base: <strong>R$ ${baseValue.toFixed(2)}</strong> - Desconto: <strong style="color: #059669;">R$ ${discAmount.toFixed(2)}</strong>
          </span>
          <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">${labelContext}</div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.8rem; color: var(--text-muted); display: block;">Novo Valor:</span>
          <strong style="font-size: 1.25rem; color: var(--primary);">R$ ${finalValue.toFixed(2)}</strong>
        </div>
      </div>
    `;
  }

  handleSaveDiscount(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'salvar bolsas')) return;

    const mode = document.getElementById('discount-mode')?.value || 'bolsa';
    const turmaId = document.getElementById('discount-turma-id').value;
    const studentId = document.getElementById('discount-student-id').value;
    const monthKey = document.getElementById('discount-month-key').value;
    const type = document.getElementById('discount-type').value;
    const valueNum = parseFloat(document.getElementById('discount-value').value);
    const description = document.getElementById('discount-description').value.trim();

    if (isNaN(valueNum) || valueNum < 0) {
      this.app.showToast('Informe um valor de desconto válido e positivo.', 'warning');
      return;
    }

    if (type === 'percent' && valueNum > 100) {
      this.app.showToast('O desconto em porcentagem não pode ultrapassar 100%.', 'warning');
      return;
    }

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) {
      this.app.showToast('Turma não encontrada.', 'error');
      return;
    }

    if (mode === 'bolsa') {
      if (!turma.studentBolsas) turma.studentBolsas = {};
      turma.studentBolsas[studentId] = {
        startMonthKey: monthKey,
        type,
        value: valueNum,
        description: description || (type === 'percent' ? `Bolsa ${valueNum}%` : `Bolsa R$ ${valueNum.toFixed(2)}`),
        updatedAt: new Date().toISOString()
      };
      // Manter sincronizado para compatibilidade
      if (!turma.studentDiscounts) turma.studentDiscounts = {};
      turma.studentDiscounts[studentId] = turma.studentBolsas[studentId];

      this.app.showToast(`Bolsa configurada com sucesso a partir da competência ${monthKey}!`, 'success');
    } else {
      if (!turma.parcelaDiscounts) turma.parcelaDiscounts = {};
      const pontualKey = `${monthKey}_${studentId}`;
      turma.parcelaDiscounts[pontualKey] = {
        type,
        value: valueNum,
        description: description || (type === 'percent' ? `Desconto ${valueNum}%` : `Desconto R$ ${valueNum.toFixed(2)}`),
        updatedAt: new Date().toISOString()
      };

      this.app.showToast(`Desconto pontual aplicado exclusivamente nesta parcela!`, 'success');
    }

    turma.atualizadoEm = new Date().toISOString();
    this.app.saveState();
    this.app.closeModal('modal-financial-discount');
    this.renderFinanceiroTable();

    // Se o carnê estiver aberto, recarrega ele em tempo real
    const carneModal = document.getElementById('modal-student-carne');
    if (carneModal && carneModal.classList.contains('open')) {
      this.openStudentCarneModal(turmaId, studentId);
    }
  }

  async removeDiscount() {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'remover bolsas')) return;

    const mode = document.getElementById('discount-mode')?.value || 'bolsa';
    const turmaId = document.getElementById('discount-turma-id').value;
    const studentId = document.getElementById('discount-student-id').value;
    const monthKey = document.getElementById('discount-month-key').value;
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!turma) return;

    const isBolsa = mode === 'bolsa';
    const message = isBolsa
      ? 'Deseja remover a bolsa deste aluno? As mensalidades futuras retornarão ao valor integral.'
      : 'Deseja remover o desconto pontual desta parcela? A mensalidade deste mês voltará ao valor original.';

    const confirmed = await this.app.confirmAction({
      title: isBolsa ? 'Remover Bolsa' : 'Remover Desconto da Parcela',
      message,
      confirmText: 'Sim, Remover',
      cancelText: 'Cancelar',
      type: 'warning'
    });

    if (confirmed) {
      if (isBolsa) {
        if (turma.studentBolsas) delete turma.studentBolsas[studentId];
        if (turma.studentDiscounts) delete turma.studentDiscounts[studentId];
        this.app.showToast('Bolsa removida com sucesso.', 'info');
      } else {
        const pontualKey = `${monthKey}_${studentId}`;
        if (turma.parcelaDiscounts) delete turma.parcelaDiscounts[pontualKey];
        this.app.showToast('Desconto pontual removido desta parcela.', 'info');
      }

      turma.atualizadoEm = new Date().toISOString();
      this.app.saveState();
      this.app.closeModal('modal-financial-discount');
      this.renderFinanceiroTable();

      const carneModal = document.getElementById('modal-student-carne');
      if (carneModal && carneModal.classList.contains('open')) {
        this.openStudentCarneModal(turmaId, studentId);
      }
    }
  }

  /* =========================================================================
     5. COBRANÇAS AVULSAS / TAXAS EXTRAS (COMPATIBILIDADE RETROATIVA)
     ========================================================================= */
  openFinancialModal() {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'abrir lançamento financeiro')) return;

    this.app.populateSelectDropdowns();

    const titleEl = document.getElementById('modal-financial-title');
    const saveBtn = document.getElementById('btn-save-financial');
    const idInput = document.getElementById('fin-id');
    const descInput = document.getElementById('fin-descricao');
    const valorInput = document.getElementById('fin-valor');
    const vencInput = document.getElementById('fin-vencimento');
    const statusInput = document.getElementById('fin-status');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> Lançar Cobrança Avulsa / Taxa Extra';
    if (saveBtn) saveBtn.textContent = 'Salvar Lançamento';
    if (idInput) idInput.value = '';
    if (descInput) descInput.value = '';
    if (valorInput) valorInput.value = '';
    if (vencInput) {
      const today = new Date().toISOString().split('T')[0];
      vencInput.value = today;
    }
    if (statusInput) statusInput.value = 'Pendente';

    document.getElementById('modal-financial')?.classList.add('open');
  }

  editFinancial(id) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'editar lançamento financeiro')) return;

    const fin = (this.state.financial || []).find(f => f.id === id);
    if (!fin) {
      this.app.showToast('Lançamento financeiro não localizado para edição.', 'error');
      return;
    }

    this.app.populateSelectDropdowns();

    const titleEl = document.getElementById('modal-financial-title');
    const saveBtn = document.getElementById('btn-save-financial');
    const idInput = document.getElementById('fin-id');
    const alunoInput = document.getElementById('fin-aluno');
    const descInput = document.getElementById('fin-descricao');
    const valorInput = document.getElementById('fin-valor');
    const vencInput = document.getElementById('fin-vencimento');
    const statusInput = document.getElementById('fin-status');

    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Lançamento Financeiro';
    if (saveBtn) saveBtn.textContent = 'Atualizar Lançamento';
    if (idInput) idInput.value = fin.id;
    if (alunoInput) alunoInput.value = fin.studentId || '';
    if (descInput) descInput.value = fin.description || '';
    if (valorInput) valorInput.value = fin.value !== undefined ? fin.value : '';
    if (vencInput) vencInput.value = fin.dueDate || '';
    if (statusInput) statusInput.value = fin.status || 'Pendente';

    document.getElementById('modal-financial')?.classList.add('open');
  }

  handleSaveFinancial(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'salvar lançamentos')) return;

    const finId = document.getElementById('fin-id') ? document.getElementById('fin-id').value.trim() : '';
    const studentId = document.getElementById('fin-aluno').value;
    const description = document.getElementById('fin-descricao').value.trim();
    const value = parseFloat(document.getElementById('fin-valor').value);
    const dueDate = document.getElementById('fin-vencimento').value;
    const status = document.getElementById('fin-status').value;
    const activeSchool = this.app.getActiveSchool();

    if (!studentId) {
      this.app.showToast('Selecione um aluno para vincular a cobrança.', 'warning');
      return;
    }

    if (isNaN(value) || value <= 0) {
      this.app.showToast('Informe um valor numérico positivo para a cobrança.', 'warning');
      return;
    }

    if (!this.state.financial) this.state.financial = [];

    if (finId) {
      const finIndex = this.state.financial.findIndex(f => f.id === finId);
      if (finIndex >= 0) {
        this.state.financial[finIndex].studentId = studentId;
        this.state.financial[finIndex].description = description;
        this.state.financial[finIndex].value = value;
        this.state.financial[finIndex].dueDate = dueDate;
        this.state.financial[finIndex].status = status;
        this.state.financial[finIndex].atualizadoEm = new Date().toISOString();

        this.app.saveState();
        this.app.closeModal('modal-financial');
        this.app.showToast('Lançamento financeiro atualizado com sucesso!', 'success');
        this.renderFinanceiroTable();
      }
    } else {
      const newFin = {
        id: 'fin_' + Date.now(),
        schoolId: activeSchool.id,
        studentId, 
        description, 
        value, 
        dueDate, 
        status,
        criadoEm: new Date().toISOString()
      };

      this.state.financial.push(newFin);
      this.app.saveState();
      this.app.closeModal('modal-financial');
      this.app.showToast('Cobrança avulsa cadastrada com sucesso!', 'success');
      this.renderFinanceiroTable();
    }
  }

  async deleteFinancial(id) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'excluir lançamento financeiro')) return;

    const fin = (this.state.financial || []).find(f => f.id === id);
    if (!fin) return;

    const confirmed = await this.app.confirmAction({
      title: 'Excluir Lançamento Financeiro',
      message: `Deseja realmente excluir a cobrança "${fin.description}" de R$ ${parseFloat(fin.value).toFixed(2)}?`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.financial = (this.state.financial || []).filter(f => f.id !== id);
      this.app.saveState();
      this.app.showToast('Lançamento financeiro removido com sucesso.', 'success');
      this.renderFinanceiroTable();
    }
  }

  payFinancial(id) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'dar baixa em pagamentos')) return;
    const item = (this.state.financial || []).find(f => f.id === id);
    if (item) {
      item.status = 'Pago';
      this.app.saveState();
      this.app.showToast('Pagamento baixado com sucesso!', 'success');
      this.renderFinanceiroTable();
    }
  }

  /* =========================================================================
     5. RELATÓRIO FINANCEIRO GERENCIAL (VISÃO GESTOR)
     ========================================================================= */
  openFinancialReportModal() {
    if (!this.app.checkPermission(['gestao'], 'acessar o relatório financeiro gerencial')) return;

    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    // 1. Preencher dropdown de Cursos
    const courseSelect = document.getElementById('fin-report-course');
    if (courseSelect) {
      const courses = (this.state.courses || []).filter(c => c.schoolId === activeSchool.id);
      courseSelect.innerHTML = `
        <option value="todos">Todos os Cursos (${courses.length})</option>
        ${courses.map(c => `<option value="${c.id}">${this.app.escapeHTML(c.name)}</option>`).join('')}
      `;
      if (this.selectedCourseId && courses.some(c => c.id === this.selectedCourseId)) {
        courseSelect.value = this.selectedCourseId;
      } else {
        courseSelect.value = 'todos';
      }
    }

    // 2. Preencher dropdown de Turmas
    this.handleReportCourseChange(false);

    // 3. Preencher datas padrão (Início e Fim do Ano Corrente)
    const startInput = document.getElementById('fin-report-start');
    const endInput = document.getElementById('fin-report-end');
    const currentYear = new Date().getFullYear();

    if (startInput && !startInput.value) {
      startInput.value = `${currentYear}-01-01`;
    }
    if (endInput && !endInput.value) {
      endInput.value = `${currentYear}-12-31`;
    }

    // 4. Gerar Relatório Inicial
    this.generateFinancialReport();

    // 5. Abrir Modal
    document.getElementById('modal-financial-report')?.classList.add('open');
  }

  handleReportCourseChange(autoGenerate = true) {
    const courseSelect = document.getElementById('fin-report-course');
    const turmaSelect = document.getElementById('fin-report-turma');
    const activeSchool = this.app.getActiveSchool();
    if (!turmaSelect || !activeSchool) return;

    const courseId = courseSelect ? courseSelect.value : 'todos';
    let turmas = (this.state.classes || []).filter(t => t.schoolId === activeSchool.id);
    if (courseId !== 'todos') {
      turmas = turmas.filter(t => t.courseId === courseId);
    }

    turmaSelect.innerHTML = `
      <option value="todas">Todas as Turmas (${turmas.length})</option>
      ${turmas.map(t => `<option value="${t.id}">${this.app.escapeHTML(t.nome)}</option>`).join('')}
    `;

    if (this.selectedTurmaId && turmas.some(t => t.id === this.selectedTurmaId)) {
      turmaSelect.value = this.selectedTurmaId;
    } else {
      turmaSelect.value = 'todas';
    }

    if (autoGenerate) {
      this.generateFinancialReport();
    }
  }

  generateFinancialReport() {
    const activeSchool = this.app.getActiveSchool();
    if (!activeSchool) return;

    const courseSelect = document.getElementById('fin-report-course');
    const turmaSelect = document.getElementById('fin-report-turma');
    const startInput = document.getElementById('fin-report-start');
    const endInput = document.getElementById('fin-report-end');

    const selectedCourse = courseSelect ? courseSelect.value : 'todos';
    const selectedTurma = turmaSelect ? turmaSelect.value : 'todas';
    const startDate = startInput ? startInput.value : '';
    const endDate = endInput ? endInput.value : '';

    let turmas = (this.state.classes || []).filter(t => t.schoolId === activeSchool.id);
    if (selectedCourse !== 'todos') {
      turmas = turmas.filter(t => t.courseId === selectedCourse);
    }
    if (selectedTurma !== 'todas') {
      turmas = turmas.filter(t => t.id === selectedTurma);
    }

    const reportRows = [];
    let totalBruto = 0;
    let totalDescontos = 0;
    let totalLiquido = 0;
    let totalRecebido = 0;
    let totalAReceber = 0;
    let totalEmAtraso = 0;
    let countRecebido = 0;
    let countAReceber = 0;
    let countEmAtraso = 0;

    const alunosEmAtrasoSet = new Set();
    const todosAlunosSet = new Set();
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // 1. Processar Mensalidades Projetadas das Turmas
    turmas.forEach(turma => {
      const course = (this.state.courses || []).find(c => c.id === turma.courseId);
      const competencias = this.getTurmaCompetencias(turma, course);
      const studentIds = turma.studentIds || [];
      const dueDay = parseInt(turma.diaVencimento, 10) || 10;

      studentIds.forEach(studentId => {
        todosAlunosSet.add(studentId);
        const student = (this.state.users || []).find(u => u.id === studentId);
        const studentName = student ? student.nome : 'Aluno Não Cadastrado';
        const studentRa = student ? (student.ra || 'S/ RA') : '';

        competencias.forEach(comp => {
          const dueDateStr = comp.dueDate; // 'YYYY-MM-DD'
          if (startDate && dueDateStr < startDate) return;
          if (endDate && dueDateStr > endDate) return;

          const calc = this.calculateStudentInstallment(turma, studentId, comp.key);
          const paymentKey = `${comp.key}_${studentId}`;
          const isPaid = (turma.payments && turma.payments[paymentKey] && turma.payments[paymentKey].status === 'Pago')
            || (this.state.financial || []).some(f => f.studentId === studentId && f.schoolId === turma.schoolId && f.dueDate && f.dueDate.startsWith(comp.key) && f.status === 'Pago');

          const [yNum, mNum] = comp.key.split('-').map(Number);
          const dueDateObj = new Date(yNum, mNum - 1, dueDay, 23, 59, 59);
          const isAtrasado = !isPaid && (today > dueDateObj);
          const status = isPaid ? 'Pago' : (isAtrasado ? 'Atrasado' : 'Pendente');

          totalBruto += calc.baseValue;
          totalDescontos += calc.totalDiscount;
          totalLiquido += calc.finalValue;

          if (status === 'Pago') {
            totalRecebido += calc.finalValue;
            countRecebido++;
          } else if (status === 'Atrasado') {
            totalEmAtraso += calc.finalValue;
            countEmAtraso++;
            alunosEmAtrasoSet.add(studentId);
          } else {
            totalAReceber += calc.finalValue;
            countAReceber++;
          }

          let discountDetail = '-';
          if (calc.bolsa || calc.pontual) {
            const parts = [];
            if (calc.bolsa) {
              const b = calc.bolsa.type === 'percent' ? `${calc.bolsa.value}%` : `R$ ${parseFloat(calc.bolsa.value).toFixed(2)}`;
              parts.push(`Bolsa: ${b}`);
            }
            if (calc.pontual) {
              const p = calc.pontual.type === 'percent' ? `${calc.pontual.value}%` : `R$ ${parseFloat(calc.pontual.value).toFixed(2)}`;
              parts.push(`Desc: ${p}`);
            }
            discountDetail = parts.join(' + ');
          }

          reportRows.push({
            studentId,
            turmaId: turma.id,
            monthKey: comp.key,
            studentName,
            studentRa,
            courseName: course ? course.name : 'Geral',
            turmaName: turma.nome,
            parcelaLabel: `Parcela ${String(comp.parcela).padStart(2, '0')}/${String(comp.totalParcelas).padStart(2, '0')} (${comp.fullLabel})`,
            dueDateFormatted: comp.dueFormatted,
            dueDateRaw: dueDateStr,
            baseValue: calc.baseValue,
            discountAmount: calc.totalDiscount,
            discountDetail,
            finalValue: calc.finalValue,
            status
          });
        });
      });
    });

    // 2. Processar Cobranças e Taxas Avulsas (se não filtrou por turma específica)
    if (selectedTurma === 'todas') {
      (this.state.financial || []).filter(f => f.schoolId === activeSchool.id).forEach(fin => {
        if (startDate && fin.dueDate && fin.dueDate < startDate) return;
        if (endDate && fin.dueDate && fin.dueDate > endDate) return;

        const student = (this.state.users || []).find(u => u.id === fin.studentId);
        if (!student) return;

        if (selectedCourse !== 'todos') {
          const studentTurmas = (this.state.classes || []).filter(t => t.courseId === selectedCourse && (t.studentIds || []).includes(student.id));
          if (studentTurmas.length === 0) return;
        }

        todosAlunosSet.add(student.id);
        const val = parseFloat(fin.value) || 0;
        const isPaid = fin.status === 'Pago';
        const dueDateObj = fin.dueDate ? new Date(fin.dueDate + 'T23:59:59') : new Date();
        const isAtrasado = !isPaid && (today > dueDateObj);
        const status = isPaid ? 'Pago' : (isAtrasado ? 'Atrasado' : 'Pendente');

        totalBruto += val;
        totalLiquido += val;

        if (status === 'Pago') {
          totalRecebido += val;
          countRecebido++;
        } else if (status === 'Atrasado') {
          totalEmAtraso += val;
          countEmAtraso++;
          alunosEmAtrasoSet.add(student.id);
        } else {
          totalAReceber += val;
          countAReceber++;
        }

        reportRows.push({
          studentId: student.id,
          turmaId: null,
          monthKey: null,
          studentName: student.nome,
          studentRa: student.ra || 'S/ RA',
          courseName: 'Lançamento Avulso',
          turmaName: '-',
          parcelaLabel: fin.description || 'Taxa / Cobrança Avulsa',
          dueDateFormatted: fin.dueDate ? fin.dueDate.split('-').reverse().join('/') : '-',
          dueDateRaw: fin.dueDate || '',
          baseValue: val,
          discountAmount: 0,
          discountDetail: '-',
          finalValue: val,
          status
        });
      });
    }

    // Ordenar linhas por data de vencimento e nome
    reportRows.sort((a, b) => a.dueDateRaw.localeCompare(b.dueDateRaw) || a.studentName.localeCompare(b.studentName));
    this.lastReportRows = reportRows;

    // Cálculos de Indicadores
    const pctDesconto = totalBruto > 0 ? ((totalDescontos / totalBruto) * 100).toFixed(1) : '0.0';
    const totalAlunos = todosAlunosSet.size;
    const totalAlunosAtraso = alunosEmAtrasoSet.size;
    const pctInadimplencia = totalAlunos > 0 ? ((totalAlunosAtraso / totalAlunos) * 100).toFixed(1) : '0.0';

    // 3. Renderizar Cards de KPIs
    const kpisContainer = document.getElementById('fin-report-kpis');
    if (kpisContainer) {
      kpisContainer.innerHTML = `
        <div class="grid-5" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 0.85rem;">
          <div class="stat-card" style="margin-bottom: 0; padding: 0.95rem; border-left: 4px solid #059669;">
            <div class="stat-details">
              <h3 style="font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-circle-check" style="color: #059669;"></i> Recebido (Pago)
              </h3>
              <div class="value" style="font-size: 1.25rem; color: #059669; font-weight: 800;">R$ ${totalRecebido.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem; color: var(--text-muted);">${countRecebido} parcela(s) baixada(s)</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 0.95rem; border-left: 4px solid #d97706;">
            <div class="stat-details">
              <h3 style="font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-clock" style="color: #d97706;"></i> A Receber (Pendente)
              </h3>
              <div class="value" style="font-size: 1.25rem; color: #d97706; font-weight: 800;">R$ ${totalAReceber.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem; color: var(--text-muted);">${countAReceber} parcela(s) a vencer</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 0.95rem; border-left: 4px solid #ef4444;">
            <div class="stat-details">
              <h3 style="font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> Em Atraso (Vencido)
              </h3>
              <div class="value" style="font-size: 1.25rem; color: #ef4444; font-weight: 800;">R$ ${totalEmAtraso.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem; color: var(--text-muted);">${countEmAtraso} parcela(s) em atraso</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 0.95rem; border-left: 4px solid #8b5cf6;">
            <div class="stat-details">
              <h3 style="font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-user-xmark" style="color: #8b5cf6;"></i> Alunos em Atraso
              </h3>
              <div class="value" style="font-size: 1.25rem; color: #8b5cf6; font-weight: 800;">${totalAlunosAtraso} <small style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">de ${totalAlunos}</small></div>
              <div class="subtext" style="font-size: 0.72rem; color: var(--text-muted);">${pctInadimplencia}% de inadimplência</div>
            </div>
          </div>

          <div class="stat-card" style="margin-bottom: 0; padding: 0.95rem; border-left: 4px solid var(--primary);">
            <div class="stat-details">
              <h3 style="font-size: 0.74rem; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-tags" style="color: var(--primary);"></i> Total de Descontos
              </h3>
              <div class="value" style="font-size: 1.25rem; color: var(--primary); font-weight: 800;">R$ ${totalDescontos.toFixed(2)}</div>
              <div class="subtext" style="font-size: 0.72rem; color: var(--text-muted);">${pctDesconto}% do bruto (R$ ${totalBruto.toFixed(2)})</div>
            </div>
          </div>
        </div>
      `;
    }

    // 4. Renderizar Linhas da Tabela
    const tbody = document.getElementById('fin-report-table-body');
    const tfoot = document.getElementById('fin-report-table-foot');

    if (tbody) {
      if (reportRows.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center; padding: 2.5rem; color: var(--text-muted);">
              <i class="fa-solid fa-folder-open" style="font-size: 2rem; opacity: 0.35; display: block; margin-bottom: 0.5rem;"></i>
              Nenhum lançamento financeiro encontrado para os filtros selecionados.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = reportRows.map(row => {
          const badgeClass = row.status === 'Pago' ? 'badge-success' : (row.status === 'Atrasado' ? 'badge-danger' : 'badge-warning');
          const icon = row.status === 'Pago' ? 'fa-circle-check' : (row.status === 'Atrasado' ? 'fa-triangle-exclamation' : 'fa-clock');

          return `
            <tr>
              <td>
                <div style="font-weight: 700; color: var(--text-main);">${this.app.escapeHTML(row.studentName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">RA: <span class="ra-badge">${this.app.escapeHTML(row.studentRa)}</span></div>
              </td>
              <td>
                <div style="font-weight: 600;">${this.app.escapeHTML(row.turmaName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${this.app.escapeHTML(row.courseName)}</div>
              </td>
              <td>${this.app.escapeHTML(row.parcelaLabel)}</td>
              <td>${row.dueDateFormatted}</td>
              <td>R$ ${row.baseValue.toFixed(2)}</td>
              <td>
                ${row.discountAmount > 0 
                  ? `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #059669; font-weight: 700;">-R$ ${row.discountAmount.toFixed(2)} (${this.app.escapeHTML(row.discountDetail)})</span>`
                  : `<span style="color: var(--text-muted);">-</span>`
                }
              </td>
              <td><strong style="color: var(--primary);">R$ ${row.finalValue.toFixed(2)}</strong></td>
              <td>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="badge ${badgeClass}" style="display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid ${icon}"></i> ${row.status}
                  </span>
                  ${row.status === 'Atrasado' && row.studentId && row.turmaId ? `
                    <button type="button" 
                            class="btn btn-sm no-print" 
                            style="background: #25D366; color: #ffffff; padding: 2px 6px; font-size: 0.72rem; border: none;"
                            onclick="app.sendWhatsAppCobrança('${row.studentId}', '${row.turmaId}', '${row.monthKey || ''}')" 
                            title="Cobrar Aluno via WhatsApp">
                      <i class="fa-brands fa-whatsapp"></i>
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    if (tfoot) {
      tfoot.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: right; padding: 0.75rem 1rem;">
            Totais (${reportRows.length} registros):
          </td>
          <td>R$ ${totalBruto.toFixed(2)}</td>
          <td style="color: #059669;">-R$ ${totalDescontos.toFixed(2)} (${pctDesconto}%)</td>
          <td style="color: var(--primary); font-size: 0.95rem;">R$ ${totalLiquido.toFixed(2)}</td>
          <td>
            <div style="font-size: 0.74rem; color: var(--text-muted);">
              <span style="color: #059669; font-weight: 700;">Pago: R$ ${totalRecebido.toFixed(2)}</span><br>
              <span style="color: #ef4444; font-weight: 700;">Atraso: R$ ${totalEmAtraso.toFixed(2)}</span>
            </div>
          </td>
        </tr>
      `;
    }
  }

  printFinancialReport() {
    return this.app.pdfService.exportFinancialReport();
  }

  /* =========================================================================
     6. COBRANÇA VIA WHATSAPP, EXPORTAÇÃO CSV & SIMULAÇÃO PIX
     ========================================================================= */
  sendWhatsAppCobrança(studentId, turmaId, monthKey) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'enviar cobranças')) return;

    const student = (this.state.users || []).find(u => u.id === studentId);
    if (!student) {
      this.app.showToast('Dados do aluno não localizados.', 'error');
      return;
    }

    const rawPhone = student.telefone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      this.app.showToast(`O aluno "${student.nome}" não possui número de telefone/WhatsApp cadastrado. Complete o cadastro do usuário para enviar mensagens.`, 'warning', 'Telefone Ausente');
      return;
    }

    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    const course = turma ? (this.state.courses || []).find(c => c.id === turma.courseId) : null;
    const calc = turma ? this.calculateStudentInstallment(turma, studentId, monthKey) : { finalValue: 0 };
    const competencias = turma ? this.getTurmaCompetencias(turma, course) : [];
    const comp = competencias.find(c => c.key === monthKey);

    const parcelaTxt = comp ? `Parcela ${String(comp.parcela).padStart(2, '0')}/${String(comp.totalParcelas).padStart(2, '0')} (${comp.fullLabel})` : `Competência ${monthKey}`;
    const vencTxt = comp ? comp.dueFormatted : 'Vencimento expirado';
    const activeSchool = this.app.getActiveSchool();
    const escolaNome = activeSchool ? activeSchool.nome : 'Portal do Curso';
    const chavePix = activeSchool ? (activeSchool.chavePix || activeSchool.cnpj || 'financeiro@escola.com') : 'financeiro@escola.com';

    const msg = `Olá, ${student.nome}! 👋\n\nConsta em nosso sistema financeiro da *${escolaNome}* uma pendência referente à *${parcelaTxt}* da turma *${turma ? turma.nome : ''}*.\n\n📅 Vencimento: *${vencTxt}*\n💰 Valor Atual: *R$ ${calc.finalValue.toFixed(2)}*\n\n🔑 Chave PIX da instituição:\n\`${chavePix}\`\n\nCaso já tenha efetuado o pagamento, por favor nos envie o comprovante para regularização. Permanecemos à disposição!\n\nAtenciosamente,\n*Setor Financeiro - ${escolaNome}*`;

    const phoneFormatted = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const waUrl = `https://wa.me/${phoneFormatted}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  }

  exportFinancialReportCSV() {
    if (!this.lastReportRows || this.lastReportRows.length === 0) {
      this.app.showToast('Nenhum dado disponível no relatório atual para exportação.', 'warning');
      return;
    }

    const headers = ['Aluno', 'RA', 'Curso', 'Turma', 'Parcela / Competência', 'Vencimento', 'Valor Base (R$)', 'Desconto (R$)', 'Detalhe Desconto', 'Valor Líquido (R$)', 'Status'];
    const csvLines = [headers.join(';')];

    this.lastReportRows.forEach(r => {
      const line = [
        `"${(r.studentName || '').replace(/"/g, '""')}"`,
        `"${(r.studentRa || '').replace(/"/g, '""')}"`,
        `"${(r.courseName || '').replace(/"/g, '""')}"`,
        `"${(r.turmaName || '').replace(/"/g, '""')}"`,
        `"${(r.parcelaLabel || '').replace(/"/g, '""')}"`,
        `"${r.dueDateFormatted || ''}"`,
        `"${(r.baseValue || 0).toFixed(2).replace('.', ',')}"`,
        `"${(r.discountAmount || 0).toFixed(2).replace('.', ',')}"`,
        `"${(r.discountDetail || '-').replace(/"/g, '""')}"`,
        `"${(r.finalValue || 0).toFixed(2).replace('.', ',')}"`,
        `"${r.status || ''}"`
      ];
      csvLines.push(line.join(';'));
    });

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().substring(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_financeiro_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.app.showToast('Planilha CSV gerada e baixada com sucesso!', 'success');
  }

  generatePixPayload({ chave, tipo, valor, beneficiario, cidade, txid = '***' }) {
    let chaveSanitizada = (chave || '').trim();
    if (tipo === 'cnpj' || tipo === 'cpf') {
      chaveSanitizada = chaveSanitizada.replace(/\D/g, '');
    } else if (tipo === 'telefone') {
      let tel = chaveSanitizada.replace(/\D/g, '');
      if (tel.length === 10 || tel.length === 11) {
        tel = `+55${tel}`;
      } else if (!chaveSanitizada.startsWith('+')) {
        tel = `+${tel}`;
      }
      chaveSanitizada = tel;
    }

    const valorNum = typeof valor === 'number' ? valor : parseFloat(valor) || 0;
    const valorStr = valorNum.toFixed(2);

    const normalize = (str) => (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();

    const nomeBeneficiario = (normalize(beneficiario) || 'PORTAL DO CURSO').substring(0, 25).toUpperCase();
    const cidadeBeneficiario = (normalize(cidade) || 'SAO PAULO').substring(0, 15).toUpperCase();
    const idTransacao = (normalize(txid) || '***').substring(0, 25);

    const tlv = (id, value) => {
      const v = String(value);
      const len = String(v.length).padStart(2, '0');
      return `${id}${len}${v}`;
    };

    const merchantAccountInfo = 
      tlv('00', 'br.gov.bcb.pix') +
      tlv('01', chaveSanitizada);

    const additionalData = tlv('05', idTransacao);

    let payload = 
      tlv('00', '01') +
      tlv('26', merchantAccountInfo) +
      tlv('52', '0000') +
      tlv('53', '986') +
      tlv('54', valorStr) +
      tlv('58', 'BR') +
      tlv('59', nomeBeneficiario) +
      tlv('60', cidadeBeneficiario) +
      tlv('62', additionalData) +
      '6304';

    // CRC16-CCITT (Polinômio 0x1021, valor inicial 0xFFFF)
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= (payload.charCodeAt(i) << 8);
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

    return {
      payload: payload + crcHex,
      chave: chaveSanitizada,
      beneficiario: nomeBeneficiario,
      cidade: cidadeBeneficiario,
      valor: valorStr
    };
  }

  openPixModal(turmaId, studentId, monthKey) {
    const student = (this.state.users || []).find(u => u.id === studentId);
    const turma = (this.state.classes || []).find(t => t.id === turmaId);
    if (!student || !turma) return;

    const course = (this.state.courses || []).find(c => c.id === turma.courseId);
    const calc = this.calculateStudentInstallment(turma, studentId, monthKey);
    const competencias = this.getTurmaCompetencias(turma, course);
    const comp = competencias.find(c => c.key === monthKey);
    const activeSchool = this.app.getActiveSchool();

    const parcelaLabel = comp ? `Parcela ${String(comp.parcela).padStart(2, '0')}/${String(comp.totalParcelas).padStart(2, '0')} (${comp.fullLabel})` : monthKey;
    const detailsEl = document.getElementById('pix-payment-details');
    if (detailsEl) {
      detailsEl.innerHTML = `
        <div style="font-weight: 700; color: var(--text-main); font-size: 1.05rem;">${this.app.escapeHTML(student.nome)}</div>
        <div style="margin: 4px 0; font-size: 0.84rem;">Turma: <strong>${this.app.escapeHTML(turma.nome)}</strong> • ${parcelaLabel}</div>
        <div style="font-size: 1.3rem; font-weight: 800; color: var(--primary); margin-top: 8px;">Valor a Pagar: R$ ${calc.finalValue.toFixed(2)}</div>
      `;
    }

    // Obter dados da Chave PIX cadastrada pela instituição
    const rawChave = activeSchool?.chavePix 
      ? activeSchool.chavePix.trim() 
      : ((activeSchool?.cnpj && activeSchool.cnpj !== 'Não informado') ? activeSchool.cnpj : '');
    const tipoChave = activeSchool?.tipoChavePix || (rawChave.includes('@') ? 'email' : 'cnpj');
    const beneficiario = activeSchool?.beneficiarioPix || activeSchool?.nome || 'Instituição';
    const cidade = activeSchool?.cidade || 'Sao Paulo';

    this.currentPixRawKey = rawChave;

    const keyBox = document.getElementById('pix-registered-key-box');
    const typeBadge = document.getElementById('pix-key-type-badge');
    const keyText = document.getElementById('pix-key-value-text');
    const benefName = document.getElementById('pix-beneficiary-name');
    const qrcodeContainer = document.getElementById('pix-qrcode-container');
    const qrImg = document.getElementById('pix-qrcode-img');
    const inputPix = document.getElementById('pix-copia-cola');
    const instructionsText = document.getElementById('pix-instructions-text');

    const tipoLabels = {
      'cnpj': 'Chave CNPJ',
      'cpf': 'Chave CPF',
      'email': 'Chave E-mail',
      'telefone': 'Chave Celular',
      'aleatoria': 'Chave Aleatória'
    };

    if (!rawChave) {
      // Caso a instituição ainda não tenha cadastrado chave PIX
      if (keyBox) {
        keyBox.style.display = 'block';
        keyBox.style.background = 'rgba(239, 68, 68, 0.08)';
        keyBox.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        keyBox.innerHTML = `
          <div style="display:flex; align-items:flex-start; gap:10px; color:#b91c1c;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:1.2rem; margin-top:2px;"></i>
            <div style="font-size:0.84rem; line-height:1.4;">
              <strong>Chave PIX não cadastrada na instituição.</strong><br>
              ${this.app.currentRole === 'gestao' 
                ? 'Como gestor, acesse <strong>Minha Instituição &gt; Editar Dados</strong> para cadastrar a chave PIX de recebimento.' 
                : 'Por favor, entre em contato com a secretaria da escola para orientações de pagamento.'}
            </div>
          </div>
        `;
      }
      if (qrcodeContainer) qrcodeContainer.style.display = 'none';
      if (instructionsText) instructionsText.style.display = 'none';
      if (inputPix) inputPix.value = 'Chave PIX pendente de cadastro pela instituição.';
    } else {
      if (keyBox) {
        keyBox.style.display = 'block';
        keyBox.style.background = 'rgba(0, 189, 174, 0.08)';
        keyBox.style.borderColor = 'rgba(0, 189, 174, 0.35)';
        keyBox.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span id="pix-key-type-badge" class="badge" style="background: #00bdae; color: #ffffff; font-weight: 700; text-transform: uppercase; font-size: 0.72rem; padding: 3px 8px;">
              ${tipoLabels[tipoChave] || `Chave ${tipoChave.toUpperCase()}`}
            </span>
            <span id="pix-beneficiary-name" style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">
              Titular: ${this.app.escapeHTML(beneficiario)}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 6px;">
            <span id="pix-key-value-text" style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 700; color: var(--text-main); word-break: break-all;">
              ${this.app.escapeHTML(rawChave)}
            </span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="app.copyRawPixKey()" title="Copiar apenas a chave PIX" style="padding: 4px 10px; font-size: 0.76rem; white-space: nowrap;">
              <i class="fa-solid fa-copy"></i> Copiar Chave
            </button>
          </div>
        `;
      }
      if (qrcodeContainer) qrcodeContainer.style.display = 'inline-block';
      if (instructionsText) instructionsText.style.display = 'block';

      // Gerar payload PIX no padrão oficial EMV / Banco Central
      const txid = comp ? `MENS${comp.parcela}` : 'MENSALIDADE';
      const pixObj = this.generatePixPayload({
        chave: rawChave,
        tipo: tipoChave,
        valor: calc.finalValue,
        beneficiario,
        cidade,
        txid
      });

      if (inputPix) inputPix.value = pixObj.payload;
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixObj.payload)}`;
      }
    }

    document.getElementById('modal-pix-payment')?.classList.add('open');
  }

  setButtonTemporarySuccess(btn, successText = 'Copiado!') {
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    const originalClass = btn.className;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> ${successText}`;
    btn.classList.add('btn-success');
    btn.classList.remove('btn-secondary', 'btn-primary');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.className = originalClass;
    }, 2200);
  }

  copyRawPixKey(e) {
    const key = this.currentPixRawKey || '';
    if (!key) {
      this.app.showToast('Nenhuma chave PIX cadastrada para copiar.', 'warning');
      return;
    }
    const btn = (e && e.currentTarget) || document.querySelector('#pix-registered-key-box button');
    navigator.clipboard.writeText(key).then(() => {
      this.setButtonTemporarySuccess(btn, 'Chave Copiada!');
      this.app.showToast(`Chave PIX "${key}" copiada com sucesso!`, 'success');
    }).catch(() => {
      const temp = document.createElement('input');
      temp.value = key;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      this.setButtonTemporarySuccess(btn, 'Chave Copiada!');
      this.app.showToast(`Chave PIX "${key}" copiada!`, 'success');
    });
  }

  copyPixCode(e) {
    const inputPix = document.getElementById('pix-copia-cola');
    const btn = (e && e.currentTarget) || document.querySelector('#pix-copia-cola-box button');
    if (inputPix && inputPix.value) {
      inputPix.select();
      navigator.clipboard.writeText(inputPix.value).then(() => {
        this.setButtonTemporarySuccess(btn, 'Código Copiado!');
        this.app.showToast('Código PIX Copia e Cola copiado para a área de transferência!', 'success');
      }).catch(() => {
        document.execCommand('copy');
        this.setButtonTemporarySuccess(btn, 'Código Copiado!');
        this.app.showToast('Código PIX copiado!', 'success');
      });
    }
  }
}
