/**
 * academicCalendar.js - Módulo de Calendário Acadêmico Institucional
 * Portal do Curso
 */

export class AcademicCalendarModule {
  constructor(app) {
    this.app = app;
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth(); // 0 a 11
    this.selectedCategoryFilter = 'todas';
    this.selectedDayFilter = null; // Quando o usuário clica num dia específico
    this.editingEventId = null;

    this.categories = {
      feriado: {
        label: 'Feriado / Recesso Oficial',
        color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.15)',
        textColor: '#dc2626',
        badgeClass: 'badge-danger',
        icon: 'fa-flag'
      },
      aulas: {
        label: 'Período Letivo / Aulas',
        color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        textColor: '#2563eb',
        badgeClass: 'badge-primary',
        icon: 'fa-book-open'
      },
      matricula: {
        label: 'Matrículas & Prazos',
        color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        textColor: '#059669',
        badgeClass: 'badge-success',
        icon: 'fa-id-card'
      },
      avaliacao: {
        label: 'Avaliações & Provas',
        color: '#f59e0b',
        bgColor: 'rgba(245, 158, 11, 0.15)',
        textColor: '#d97706',
        badgeClass: 'badge-warning',
        icon: 'fa-award'
      },
      ferias: {
        label: 'Férias Docentes / Discentes',
        color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.15)',
        textColor: '#7c3aed',
        badgeClass: 'badge-purple',
        icon: 'fa-umbrella-beach'
      },
      evento: {
        label: 'Eventos & Solenidades',
        color: '#06b6d4',
        bgColor: 'rgba(6, 182, 212, 0.15)',
        textColor: '#0891b2',
        badgeClass: 'badge-info',
        icon: 'fa-bullhorn'
      }
    };
  }

  get state() {
    return this.app.state;
  }

  /* =========================================================================
     1. INICIALIZAÇÃO & SEEDING DE FERIADOS E EVENTOS 2026
     ========================================================================= */
  ensureCalendarData() {
    if (!this.state.academicCalendar || !Array.isArray(this.state.academicCalendar)) {
      this.state.academicCalendar = [];
    }

    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    // Se a instituição não tiver nenhum evento registrado, carrega o calendário letivo oficial de 2026
    const hasEvents = this.state.academicCalendar.some(ev => !schoolId || ev.schoolId === schoolId);
    if (!hasEvents) {
      const defaultEvents = [
        // JANEIRO 2026
        {
          id: 'cal_2026_01_01',
          schoolId,
          title: 'Confraternização Universal - Feriado Nacional',
          startDate: '2026-01-01',
          endDate: '2026-01-01',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional de Ano Novo.'
        },
        {
          id: 'cal_2026_01_ferias',
          schoolId,
          title: 'Férias docentes 1º período referente ao ano de 2026 (26 dias)',
          startDate: '2026-01-05',
          endDate: '2026-01-30',
          category: 'ferias',
          target: 'todos',
          description: 'Período regulamentar de férias coletivas do corpo docente e recesso de estudantes.'
        },
        {
          id: 'cal_2026_01_matr',
          schoolId,
          title: 'Período de Matrículas e Rematrículas para o Período Letivo 2026.1',
          startDate: '2026-01-12',
          endDate: '2026-01-23',
          category: 'matricula',
          target: 'todos',
          description: 'Prazo limite para requerer matrícula, trancamento e regime de movimentação temporária.'
        },

        // FEVEREIRO 2026
        {
          id: 'cal_2026_02_inicio',
          schoolId,
          title: 'Início das Aulas do 1º Semestre Letivo de 2026 (2026.1)',
          startDate: '2026-02-02',
          endDate: '2026-02-02',
          category: 'aulas',
          target: 'todos',
          description: 'Acolhimento aos ingressantes e retorno às aulas regulares de todas as turmas.'
        },
        {
          id: 'cal_2026_02_carnaval',
          schoolId,
          title: 'Recesso de Carnaval & Quarta-feira de Cinzas',
          startDate: '2026-02-16',
          endDate: '2026-02-18',
          category: 'feriado',
          target: 'todos',
          description: 'Não haverá atividades letivas ou administrativas.'
        },

        // ABRIL 2026
        {
          id: 'cal_2026_04_semana_santa',
          schoolId,
          title: 'Semana Santa & Paixão de Cristo (Feriado Nacional)',
          startDate: '2026-04-03',
          endDate: '2026-04-05',
          category: 'feriado',
          target: 'todos',
          description: 'Recesso escolar e feriado religioso de Páscoa.'
        },
        {
          id: 'cal_2026_04_provas',
          schoolId,
          title: 'Semana de Avaliações Parciais do 1º Bimestre (P1)',
          startDate: '2026-04-06',
          endDate: '2026-04-10',
          category: 'avaliacao',
          target: 'todos',
          description: 'Aplicação de provas e avaliações diagnósticas presenciais.'
        },
        {
          id: 'cal_2026_04_tiradentes',
          schoolId,
          title: 'Tiradentes - Feriado Nacional',
          startDate: '2026-04-21',
          endDate: '2026-04-21',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },

        // MAIO 2026
        {
          id: 'cal_2026_05_trabalho',
          schoolId,
          title: 'Dia Mundial do Trabalho - Feriado Nacional',
          startDate: '2026-05-01',
          endDate: '2026-05-01',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },

        // JUNHO 2026
        {
          id: 'cal_2026_06_corpus',
          schoolId,
          title: 'Corpus Christi - Ponto Facultativo / Recesso',
          startDate: '2026-06-04',
          endDate: '2026-06-05',
          category: 'feriado',
          target: 'todos',
          description: 'Recesso institucional prolongado.'
        },
        {
          id: 'cal_2026_06_provas_finais',
          schoolId,
          title: 'Período de Avaliações Finais e Exames do 1º Semestre (2026.1)',
          startDate: '2026-06-15',
          endDate: '2026-06-23',
          category: 'avaliacao',
          target: 'todos',
          description: 'Avaliações regimentais e provas de segunda chamada/exame.'
        },
        {
          id: 'cal_2026_06_encerramento',
          schoolId,
          title: 'Término do 1º Semestre Letivo de 2026 (2026.1)',
          startDate: '2026-06-30',
          endDate: '2026-06-30',
          category: 'aulas',
          target: 'todos',
          description: 'Encerramento oficial das 100 diárias letivas do 1º semestre.'
        },

        // JULHO 2026
        {
          id: 'cal_2026_07_ferias',
          schoolId,
          title: 'Recesso Escolar de Julho & Férias Docentes',
          startDate: '2026-07-01',
          endDate: '2026-07-24',
          category: 'ferias',
          target: 'todos',
          description: 'Férias de inverno para discentes e docentes.'
        },
        {
          id: 'cal_2026_07_matr2',
          schoolId,
          title: 'Período de Matrículas e Ajustes para o 2º Semestre (2026.2)',
          startDate: '2026-07-20',
          endDate: '2026-07-31',
          category: 'matricula',
          target: 'todos',
          description: 'Matrículas de ingressantes e renovação de veteranos.'
        },

        // AGOSTO 2026
        {
          id: 'cal_2026_08_inicio',
          schoolId,
          title: 'Início das Aulas do 2º Semestre Letivo de 2026 (2026.2)',
          startDate: '2026-08-03',
          endDate: '2026-08-03',
          category: 'aulas',
          target: 'todos',
          description: 'Retorno às aulas de todos os cursos e turmas.'
        },

        // SETEMBRO 2026
        {
          id: 'cal_2026_09_independencia',
          schoolId,
          title: 'Independência do Brasil - Feriado Nacional',
          startDate: '2026-09-07',
          endDate: '2026-09-07',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },

        // OUTUBRO 2026
        {
          id: 'cal_2026_10_aparecida',
          schoolId,
          title: 'Nossa Senhora Aparecida - Padroeira do Brasil (Feriado Nacional)',
          startDate: '2026-10-12',
          endDate: '2026-10-12',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },
        {
          id: 'cal_2026_10_professor',
          schoolId,
          title: 'Dia do Professor & Dia do Servidor Público (Recesso)',
          startDate: '2026-10-15',
          endDate: '2026-10-16',
          category: 'ferias',
          target: 'todos',
          description: 'Homenagem ao corpo docente e recesso pedagógico.'
        },

        // NOVEMBRO 2026
        {
          id: 'cal_2026_11_finados',
          schoolId,
          title: 'Finados - Feriado Nacional',
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },
        {
          id: 'cal_2026_11_proclamacao',
          schoolId,
          title: 'Proclamação da República - Feriado Nacional',
          startDate: '2026-11-15',
          endDate: '2026-11-15',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },
        {
          id: 'cal_2026_11_consciencia',
          schoolId,
          title: 'Dia Nacional de Zumbi e da Consciência Negra - Feriado Nacional',
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        },

        // DEZEMBRO 2026
        {
          id: 'cal_2026_12_provas',
          schoolId,
          title: 'Período de Provas Finais e Exames do 2º Semestre (2026.2)',
          startDate: '2026-11-30',
          endDate: '2026-12-08',
          category: 'avaliacao',
          target: 'todos',
          description: 'Semana de exames finais e consolidação das médias letivas.'
        },
        {
          id: 'cal_2026_12_encerramento',
          schoolId,
          title: 'Encerramento do Ano Letivo de 2026 e Divulgação dos Resultados',
          startDate: '2026-12-18',
          endDate: '2026-12-18',
          category: 'aulas',
          target: 'todos',
          description: 'Publicação oficial de notas e boletins acadêmicos.'
        },
        {
          id: 'cal_2026_12_natal',
          schoolId,
          title: 'Natal - Feriado Nacional',
          startDate: '2026-12-25',
          endDate: '2026-12-25',
          category: 'feriado',
          target: 'todos',
          description: 'Feriado Nacional.'
        }
      ];

      this.state.academicCalendar = defaultEvents;
      this.app.saveState();
    }
  }

  /* =========================================================================
     2. NAVEGAÇÃO ENTRE MESES E ANOS
     ========================================================================= */
  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.selectedDayFilter = null;
    this.render();
  }

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.selectedDayFilter = null;
    this.render();
  }

  goToToday() {
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth();
    this.selectedDayFilter = now.getDate();
    this.render();
  }

  setMonth(monthIndex) {
    this.currentMonth = parseInt(monthIndex, 10);
    this.selectedDayFilter = null;
    this.render();
  }

  setYear(year) {
    this.currentYear = parseInt(year, 10);
    this.selectedDayFilter = null;
    this.render();
  }

  setCategoryFilter(category) {
    this.selectedCategoryFilter = category;
    this.render();
  }

  toggleDayFilter(dayNum) {
    if (this.selectedDayFilter === dayNum) {
      this.selectedDayFilter = null;
    } else {
      this.selectedDayFilter = dayNum;
    }
    this.renderTableOnly();
    this.updateDayCellSelection();
  }

  /* =========================================================================
     3. CÁLCULO E RENDERIZAÇÃO DO CALENDÁRIO MÊS A MÊS
     ========================================================================= */
  render() {
    this.ensureCalendarData();

    const container = document.getElementById('tab-calendario');
    if (!container) return;

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthNameUpper = monthNames[this.currentMonth].toUpperCase();

    // Atualizar Banner Superior de Mês/Ano
    const titleEl = document.getElementById('calendar-month-title');
    if (titleEl) {
      titleEl.textContent = `${monthNameUpper} / ${this.currentYear}`;
    }

    const selectMonth = document.getElementById('calendar-select-month');
    if (selectMonth) selectMonth.value = this.currentMonth;

    const selectYear = document.getElementById('calendar-select-year');
    if (selectYear) selectYear.value = this.currentYear;

    // Renderizar Componentes
    this.renderMonthGrid();
    this.renderTableOnly();
    this.renderCategoryPills();
  }

  renderCategoryPills() {
    const container = document.getElementById('calendar-category-pills');
    if (!container) return;

    const categoriesList = [
      { key: 'todas', label: 'Todos os Eventos', color: 'var(--primary)' },
      { key: 'feriado', label: 'Feriados & Recessos', color: '#ef4444' },
      { key: 'aulas', label: 'Período Letivo / Aulas', color: '#3b82f6' },
      { key: 'matricula', label: 'Matrículas & Prazos', color: '#10b981' },
      { key: 'avaliacao', label: 'Avaliações & Provas', color: '#f59e0b' },
      { key: 'ferias', label: 'Férias Docentes', color: '#8b5cf6' },
      { key: 'evento', label: 'Eventos & Solenidades', color: '#06b6d4' }
    ];

    container.innerHTML = categoriesList.map(cat => {
      const isActive = this.selectedCategoryFilter === cat.key;
      return `
        <button type="button" 
                class="btn-calendar-pill ${isActive ? 'active' : ''}" 
                onclick="app.calendarModule.setCategoryFilter('${cat.key}')"
                style="${isActive ? `background: ${cat.color}; color: #ffffff; border-color: ${cat.color};` : ''}">
          <span class="pill-dot" style="background: ${cat.color};"></span>
          ${cat.label}
        </button>
      `;
    }).join('');
  }

  renderMonthGrid() {
    const gridBody = document.getElementById('calendar-grid-days');
    if (!gridBody) return;

    const firstDayIndex = new Date(this.currentYear, this.currentMonth, 1).getDay(); // 0 = Domingo
    const totalDaysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();

    const today = new Date();
    const isCurrentRealMonth = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth;
    const todayDate = today.getDate();

    // Obter eventos deste mês
    const monthEvents = this.getEventsForMonth(this.currentYear, this.currentMonth);

    let html = '';

    // Dias do mês anterior para preencher a primeira semana
    for (let i = firstDayIndex; i > 0; i--) {
      const prevDay = prevMonthLastDay - i + 1;
      html += `<div class="cal-day-cell other-month">${prevDay}</div>`;
    }

    // Dias do mês atual
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dayStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDateObj = new Date(this.currentYear, this.currentMonth, day);
      const isSunday = dayDateObj.getDay() === 0;
      const isToday = isCurrentRealMonth && day === todayDate;
      const isSelected = this.selectedDayFilter === day;

      // Eventos que incidem neste dia
      const eventsOnDay = monthEvents.filter(ev => {
        return dayStr >= ev.startDate && dayStr <= ev.endDate;
      });

      // Determinar cor primária do dia se houver evento
      let dayBgClass = '';
      let dayStyle = '';
      let dotBadgesHtml = '';

      if (eventsOnDay.length > 0) {
        // Pega o evento com maior relevância
        const priorityOrder = ['feriado', 'ferias', 'avaliacao', 'matricula', 'aulas', 'evento'];
        const sortedEvents = [...eventsOnDay].sort((a, b) => {
          return priorityOrder.indexOf(a.category) - priorityOrder.indexOf(b.category);
        });
        const primaryEv = sortedEvents[0];
        const catConfig = this.categories[primaryEv.category] || this.categories.aulas;

        dayBgClass = `has-event event-${primaryEv.category}`;
        dayStyle = `background: ${catConfig.bgColor}; border-color: ${catConfig.color}; color: ${catConfig.textColor}; font-weight: 700;`;

        // Mini marcadores coloridos se houver múltiplos eventos
        if (eventsOnDay.length > 1) {
          const dots = eventsOnDay.slice(0, 3).map(ev => {
            const c = this.categories[ev.category]?.color || '#3b82f6';
            return `<span class="cal-mini-dot" style="background: ${c};"></span>`;
          }).join('');
          dotBadgesHtml = `<div class="cal-dots-bar">${dots}</div>`;
        }
      }

      const sundayClass = isSunday ? 'day-sunday' : '';
      const todayClass = isToday ? 'day-today' : '';
      const selectedClass = isSelected ? 'day-selected' : '';

      const tooltipTitle = eventsOnDay.map(ev => ev.title).join(' | ');

      html += `
        <div class="cal-day-cell ${sundayClass} ${todayClass} ${selectedClass} ${dayBgClass}" 
             style="${dayStyle}" 
             onclick="app.calendarModule.toggleDayFilter(${day})"
             title="${tooltipTitle ? this.app.escapeHTML(tooltipTitle) : `Dia ${day}`}">
          <span class="day-number">${day}</span>
          ${dotBadgesHtml}
        </div>
      `;
    }

    // Dias do próximo mês para completar a última linha (múltiplo de 7)
    const totalRendered = firstDayIndex + totalDaysInMonth;
    const remainingDays = (7 - (totalRendered % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      html += `<div class="cal-day-cell other-month">${i}</div>`;
    }

    gridBody.innerHTML = html;
  }

  updateDayCellSelection() {
    document.querySelectorAll('.cal-day-cell:not(.other-month)').forEach(el => {
      const num = parseInt(el.querySelector('.day-number')?.textContent, 10);
      if (num === this.selectedDayFilter) {
        el.classList.add('day-selected');
      } else {
        el.classList.remove('day-selected');
      }
    });
  }

  /* =========================================================================
     4. TABELA DE EVENTOS (MODELO UFRPE / UNIVERSIDADE)
     ========================================================================= */
  renderTableOnly() {
    const tbody = document.getElementById('table-calendar-events-body');
    const tableSubtitle = document.getElementById('calendar-table-subtitle');
    if (!tbody) return;

    const monthEvents = this.getEventsForMonth(this.currentYear, this.currentMonth);
    const canManage = this.app.checkPermission(['gestao', 'secretaria']);

    // Filtrar por categoria selecionada
    let filteredEvents = monthEvents;
    if (this.selectedCategoryFilter !== 'todas') {
      filteredEvents = filteredEvents.filter(ev => ev.category === this.selectedCategoryFilter);
    }

    // Filtrar por dia específico clicado no mini-calendário
    if (this.selectedDayFilter !== null) {
      const filterDayStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(this.selectedDayFilter).padStart(2, '0')}`;
      filteredEvents = filteredEvents.filter(ev => {
        return filterDayStr >= ev.startDate && filterDayStr <= ev.endDate;
      });
    }

    // Ordenar cronologicamente por startDate
    filteredEvents.sort((a, b) => a.startDate.localeCompare(b.startDate));

    if (tableSubtitle) {
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const filterDayText = this.selectedDayFilter ? ` • Filtrando pelo dia <strong>${this.selectedDayFilter}</strong> (<a href="javascript:void(0)" onclick="app.calendarModule.toggleDayFilter(null)" style="color: var(--primary); text-decoration: underline;">Limpar filtro</a>)` : '';
      tableSubtitle.innerHTML = `Mostrando <strong>${filteredEvents.length}</strong> marco(s) acadêmico(s) em <strong>${monthNames[this.currentMonth]} de ${this.currentYear}</strong>${filterDayText}`;
    }

    if (filteredEvents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${canManage ? 3 : 2}" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
            <i class="fa-solid fa-calendar-check" style="font-size: 2rem; opacity: 0.35; margin-bottom: 0.6rem; display: block;"></i>
            Nenhum evento acadêmico ou feriado encontrado para este filtro ou período.
            ${canManage ? `<div style="margin-top: 0.75rem;"><button type="button" class="btn btn-primary btn-sm" onclick="app.calendarModule.openEventModal()"><i class="fa-solid fa-plus"></i> Cadastrar Primeiro Evento</button></div>` : ''}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredEvents.map(ev => {
      const catConfig = this.categories[ev.category] || this.categories.aulas;
      const dateDisplay = this.formatDateRange(ev.startDate, ev.endDate);

      return `
        <tr class="cal-event-row">
          <td class="cal-date-col">
            <div class="cal-day-badge-box" style="border-color: ${catConfig.color}; background: ${catConfig.bgColor}; color: ${catConfig.textColor};">
              <span class="cal-day-badge-text">${dateDisplay}</span>
            </div>
          </td>
          <td class="cal-desc-col">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
              <span class="badge" style="background: ${catConfig.color}; color: #ffffff; font-size: 0.72rem; font-weight: 700; padding: 2px 7px;">
                <i class="fa-solid ${catConfig.icon}"></i> ${catConfig.label}
              </span>
              ${ev.target && ev.target !== 'todos' ? `<span class="badge badge-info" style="font-size: 0.7rem; text-transform: uppercase;">Público: ${ev.target}</span>` : ''}
            </div>
            <div class="cal-event-title" style="font-weight: 700; font-size: 0.96rem; color: var(--text-main); line-height: 1.4;">
              ${this.app.escapeHTML(ev.title)}
            </div>
            ${ev.description ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px; line-height: 1.4;">${this.app.escapeHTML(ev.description)}</div>` : ''}
          </td>
          ${canManage ? `
            <td class="cal-actions-col" style="text-align: right; white-space: nowrap;">
              <button type="button" class="action-btn-circle" onclick="app.calendarModule.openEventModal('${ev.id}')" title="Editar Evento">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button type="button" class="action-btn-circle danger" onclick="app.calendarModule.deleteEvent('${ev.id}')" title="Excluir Evento">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');
  }

  /* =========================================================================
     5. AUXILIARES DE FORMATAÇÃO E CÁLCULO
     ========================================================================= */
  getEventsForMonth(year, monthIndex) {
    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    const startOfMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(year, monthIndex + 1, 0).getDate();
    const endOfMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    const allEvents = this.state.academicCalendar || [];

    return allEvents.filter(ev => {
      if (schoolId && ev.schoolId && ev.schoolId !== schoolId) return false;
      const evStart = ev.startDate || ev.date || '';
      const evEnd = ev.endDate || ev.startDate || ev.date || '';
      return evStart <= endOfMonth && evEnd >= startOfMonth;
    });
  }

  formatDateRange(startStr, endStr) {
    if (!startStr) return '-';
    if (!endStr || startStr === endStr) {
      const day = startStr.split('-')[2] || startStr;
      return String(parseInt(day, 10)).padStart(2, '0');
    }

    const [y1, m1, d1] = startStr.split('-').map(Number);
    const [y2, m2, d2] = endStr.split('-').map(Number);

    // Se estiver no mesmo mês: exibe "05 a 30" como na imagem da universidade
    if (m1 === m2 && y1 === y2) {
      return `${String(d1).padStart(2, '0')} a ${String(d2).padStart(2, '0')}`;
    }

    // Se cruzar meses: exibe "28/01 a 05/02"
    return `${String(d1).padStart(2, '0')}/${String(m1).padStart(2, '0')} a ${String(d2).padStart(2, '0')}/${String(m2).padStart(2, '0')}`;
  }

  /* =========================================================================
     6. CRUD DE EVENTOS ACADÊMICOS (GESTÃO & SECRETARIA)
     ========================================================================= */
  openEventModal(eventId = null) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'cadastrar ou editar eventos no calendário')) return;

    this.editingEventId = eventId;
    const modalTitle = document.getElementById('modal-calendar-event-title');
    const form = document.getElementById('form-calendar-event');
    if (!form) return;

    form.reset();

    const titleInput = document.getElementById('cal-event-title');
    const categorySelect = document.getElementById('cal-event-category');
    const startInput = document.getElementById('cal-event-start-date');
    const endInput = document.getElementById('cal-event-end-date');
    const targetSelect = document.getElementById('cal-event-target');
    const descInput = document.getElementById('cal-event-desc');
    const rangeToggle = document.getElementById('cal-event-is-range');
    const rangeGroup = document.getElementById('cal-event-end-group');

    const defaultDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-01`;

    if (eventId) {
      const ev = (this.state.academicCalendar || []).find(e => e.id === eventId);
      if (!ev) return;

      if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Editar Marco do Calendário`;
      if (titleInput) titleInput.value = ev.title || '';
      if (categorySelect) categorySelect.value = ev.category || 'aulas';
      if (startInput) startInput.value = ev.startDate || '';
      if (endInput) endInput.value = ev.endDate || ev.startDate || '';
      if (targetSelect) targetSelect.value = ev.target || 'todos';
      if (descInput) descInput.value = ev.description || '';

      const isRange = ev.startDate !== ev.endDate;
      if (rangeToggle) rangeToggle.checked = isRange;
      if (rangeGroup) rangeGroup.style.display = isRange ? 'block' : 'none';
    } else {
      if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-calendar-plus"></i> Novo Marco Acadêmico / Feriado`;
      if (startInput) startInput.value = defaultDate;
      if (endInput) endInput.value = defaultDate;
      if (rangeToggle) rangeToggle.checked = false;
      if (rangeGroup) rangeGroup.style.display = 'none';
    }

    document.getElementById('modal-calendar-event')?.classList.add('open');
  }

  handleRangeToggle() {
    const rangeToggle = document.getElementById('cal-event-is-range');
    const rangeGroup = document.getElementById('cal-event-end-group');
    const startInput = document.getElementById('cal-event-start-date');
    const endInput = document.getElementById('cal-event-end-date');

    if (rangeGroup && rangeToggle) {
      const isRange = rangeToggle.checked;
      rangeGroup.style.display = isRange ? 'block' : 'none';
      if (!isRange && startInput && endInput) {
        endInput.value = startInput.value;
      }
    }
  }

  handleSaveEvent(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'salvar eventos no calendário')) return;

    const title = document.getElementById('cal-event-title')?.value.trim();
    const category = document.getElementById('cal-event-category')?.value || 'aulas';
    const startDate = document.getElementById('cal-event-start-date')?.value;
    const isRange = document.getElementById('cal-event-is-range')?.checked;
    let endDate = isRange ? document.getElementById('cal-event-end-date')?.value : startDate;
    const target = document.getElementById('cal-event-target')?.value || 'todos';
    const description = document.getElementById('cal-event-desc')?.value.trim();

    if (!title || !startDate) {
      this.app.showToast('Preencha o título e a data do evento.', 'warning');
      return;
    }

    if (!endDate || endDate < startDate) {
      endDate = startDate;
    }

    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    if (!this.state.academicCalendar) this.state.academicCalendar = [];

    if (this.editingEventId) {
      const idx = this.state.academicCalendar.findIndex(ev => ev.id === this.editingEventId);
      if (idx >= 0) {
        this.state.academicCalendar[idx] = {
          ...this.state.academicCalendar[idx],
          title,
          category,
          startDate,
          endDate,
          target,
          description,
          atualizadoEm: new Date().toISOString()
        };
        this.app.showToast('Marco acadêmico atualizado com sucesso!', 'success');
      }
    } else {
      const newEvent = {
        id: 'cal_' + Date.now(),
        schoolId,
        title,
        category,
        startDate,
        endDate,
        target,
        description,
        criadoEm: new Date().toISOString()
      };
      this.state.academicCalendar.push(newEvent);
      this.app.showToast('Novo marco acadêmico adicionado com sucesso!', 'success');
    }

    this.app.saveState();
    this.app.closeModal('modal-calendar-event');

    // Posicionar a visualização no mês do evento cadastrado
    const [y, m] = startDate.split('-').map(Number);
    this.currentYear = y;
    this.currentMonth = m - 1;
    this.render();
  }

  async deleteEvent(eventId) {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'excluir eventos do calendário')) return;

    const ev = (this.state.academicCalendar || []).find(e => e.id === eventId);
    if (!ev) return;

    const confirmed = await this.app.confirmAction({
      title: 'Excluir Marco do Calendário',
      message: `Tem certeza que deseja excluir o evento "${ev.title}"? Esta ação removerá o marco acadêmico de todos os perfis.`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.state.academicCalendar = this.state.academicCalendar.filter(e => e.id !== eventId);
      this.app.saveState();
      this.app.showToast('Evento removido do calendário.', 'info');
      this.render();
    }
  }
}
