/**
 * Portal do Curso - Notifications Module (Central de Notificações no Topo)
 * Gerenciamento de avisos inteligentes: Financeiro, Acadêmico e Comunicados
 */

export class NotificationsModule {
  constructor(app) {
    this.app = app;
    this.notifications = [];
    this.activeFilter = 'all'; // 'all', 'finance', 'academic', 'notice'
  }

  getStorageKey() {
    const userId = this.app.currentUser ? (this.app.currentUser.id || this.app.currentUser.email || 'guest') : 'guest';
    return `portal_read_notifications_${userId}`;
  }

  getReadNotificationIds() {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  saveReadNotificationIds(ids) {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(ids));
    } catch (e) {
      console.warn('Erro ao salvar notificações lidas:', e);
    }
  }

  /**
   * Varre o estado da aplicação e gera as notificações relevantes para o usuário atual
   */
  generateNotifications() {
    const user = this.app.currentUser;
    if (!user) {
      this.notifications = [];
      this.updateBadge();
      return;
    }

    const school = this.app.getActiveSchool();
    const readIds = this.getReadNotificationIds();
    const list = [];
    const now = new Date();

    // 1. Notificações do Mural de Avisos (Comunicados)
    if (this.app.state.notices && Array.isArray(this.app.state.notices)) {
      const schoolNotices = this.app.state.notices.filter(n => !n.schoolId || n.schoolId === school.id);
      schoolNotices.slice(0, 5).forEach(notice => {
        const notifId = `notice-${notice.id}`;
        list.push({
          id: notifId,
          type: 'notice',
          icon: 'fa-solid fa-bullhorn',
          iconColor: '#3b82f6',
          title: notice.title || 'Comunicado Oficial',
          message: notice.content ? (notice.content.length > 80 ? notice.content.substring(0, 80) + '...' : notice.content) : 'Novo comunicado postado no mural.',
          date: notice.date || notice.createdAt || 'Recente',
          isRead: readIds.includes(notifId),
          actionTab: 'tab-mural',
          targetId: notice.id
        });
      });
    }

    // 2. Notificações Financeiras
    if (user.tipo === 'aluno') {
      const allInstallments = this.app.state.installments || [];
      const studentInstallments = allInstallments.filter(i => 
        (i.userId === user.id || i.alunoRa === user.ra || i.studentId === user.id) &&
        i.status !== 'paga'
      );

      studentInstallments.forEach(inst => {
        let isOverdue = false;
        let isDueSoon = false;
        let daysDiff = 0;

        if (inst.dueDate) {
          const dueDate = new Date(inst.dueDate + 'T23:59:59');
          const timeDiff = dueDate.getTime() - now.getTime();
          daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

          if (daysDiff < 0) {
            isOverdue = true;
          } else if (daysDiff <= 5) {
            isDueSoon = true;
          }
        }

        if (isOverdue) {
          const notifId = `fin-overdue-${inst.id}`;
          list.push({
            id: notifId,
            type: 'finance',
            icon: 'fa-solid fa-triangle-exclamation',
            iconColor: '#ef4444',
            title: `Parcela em Atraso (${inst.numero || 'Mensalidade'})`,
            message: `Sua mensalidade de R$ ${Number(inst.valor || 0).toFixed(2).replace('.', ',')} venceu. Clique para emitir o código PIX.`,
            date: inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('pt-BR') : 'Vencida',
            isRead: readIds.includes(notifId),
            actionTab: 'tab-financeiro',
            targetId: inst.id
          });
        } else if (isDueSoon) {
          const notifId = `fin-soon-${inst.id}`;
          list.push({
            id: notifId,
            type: 'finance',
            icon: 'fa-solid fa-clock',
            iconColor: '#f59e0b',
            title: `Vencimento Próximo (${inst.numero || 'Mensalidade'})`,
            message: `Mensalidade no valor de R$ ${Number(inst.valor || 0).toFixed(2).replace('.', ',')} vence em ${daysDiff === 0 ? 'HOJE' : daysDiff + ' dia(s)'}.`,
            date: inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('pt-BR') : 'A vencer',
            isRead: readIds.includes(notifId),
            actionTab: 'tab-financeiro',
            targetId: inst.id
          });
        }
      });
    } else if (user.tipo === 'gestao' || user.tipo === 'secretaria') {
      // Alerta para gestão sobre total de atrasos
      const allInstallments = this.app.state.installments || [];
      const overdueList = allInstallments.filter(i => {
        if (i.status === 'paga') return false;
        if (!i.dueDate) return false;
        return new Date(i.dueDate + 'T23:59:59') < now;
      });

      if (overdueList.length > 0) {
        const notifId = `fin-gestao-overdue-summary-${new Date().toISOString().slice(0, 10)}`;
        list.push({
          id: notifId,
          type: 'finance',
          icon: 'fa-solid fa-file-invoice-dollar',
          iconColor: '#ef4444',
          title: 'Atenção Financeira (Inadimplência)',
          message: `Existem ${overdueList.length} mensalidade(s) com vencimento expirado aguardando quitação.`,
          date: 'Hoje',
          isRead: readIds.includes(notifId),
          actionTab: 'tab-financeiro',
          targetId: null
        });
      }
    }

    // 3. Notificações Acadêmicas
    if (user.tipo === 'aluno') {
      // Notificações de notas e avaliações recentes
      const rawGrades = Array.isArray(this.app.state.grades)
        ? this.app.state.grades
        : (this.app.state.grades && typeof this.app.state.grades === 'object'
            ? Object.values(this.app.state.grades).filter(g => g && typeof g === 'object')
            : []);

      const studentGrades = rawGrades.filter(g => g && (g.studentId === user.id || g.alunoId === user.id));
      
      if (studentGrades.length > 0) {
        studentGrades.slice(-2).forEach(g => {
          const notifId = `grade-${g.id || (g.disciplineId + '-' + (g.studentId || user.id))}`;
          const disc = (this.app.state.disciplines || []).find(d => d.id === g.disciplineId);
          const discName = disc ? disc.name : 'Disciplina';
          list.push({
            id: notifId,
            type: 'academic',
            icon: 'fa-solid fa-graduation-cap',
            iconColor: '#10b981',
            title: 'Lançamento de Avaliação',
            message: `Notas atualizadas em "${discName}". Confira seu boletim e médias.`,
            date: 'Atualizado',
            isRead: readIds.includes(notifId),
            actionTab: 'tab-meu-curso',
            targetId: g.id
          });
        });
      } else {
        // Verificar avaliações das turmas do aluno
        const studentTurmas = (this.app.state.classes || []).filter(t => 
          (t.studentIds || []).includes(user.id) || t.id === user.turmaId
        );
        const studentTurmaIds = studentTurmas.map(t => t.id);

        const studentEvaluations = (this.app.state.evaluations || []).filter(ev => 
          studentTurmaIds.some(tId => ev.turmaId && ev.turmaId.startsWith(tId))
        );

        if (studentEvaluations.length > 0) {
          studentEvaluations.slice(-2).forEach(ev => {
            const notifId = `eval-${ev.id}`;
            const disc = (this.app.state.disciplines || []).find(d => d.id === ev.disciplineId);
            const discName = disc ? disc.name : 'Disciplina';
            list.push({
              id: notifId,
              type: 'academic',
              icon: 'fa-solid fa-graduation-cap',
              iconColor: '#10b981',
              title: 'Avaliação Disponível',
              message: `Avaliação "${ev.name || 'Avaliação'}" cadastrada em ${discName}.`,
              date: 'Recente',
              isRead: readIds.includes(notifId),
              actionTab: 'tab-meu-curso',
              targetId: ev.id
            });
          });
        }
      }

      // Notificação da Carteirinha Estudantil Digital
      const notifIdCard = `card-reminder-${user.id}`;
      list.push({
        id: notifIdCard,
        type: 'academic',
        icon: 'fa-solid fa-id-card',
        iconColor: '#8b5cf6',
        title: 'Carteirinha Digital Disponível',
        message: 'Sua Carteira de Identificação Estudantil com QR Code já está disponível para visualização e emissão.',
        date: 'Ano Letivo 2026',
        isRead: readIds.includes(notifIdCard),
        actionCustom: 'studentCard'
      });
    }

    // Ordenar: não lidas primeiro, depois por relevância
    list.sort((a, b) => {
      if (a.isRead === b.isRead) return 0;
      return a.isRead ? 1 : -1;
    });

    this.notifications = list;
    this.updateBadge();
  }

  /**
   * Atualiza o badge numérico no sino do topo
   */
  updateBadge() {
    const badge = document.getElementById('notification-badge');
    const bellBtn = document.getElementById('btn-notification-bell');
    if (!badge) return;

    const unreadCount = this.notifications.filter(n => !n.isRead).length;

    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.style.display = 'flex';
      if (bellBtn) bellBtn.classList.add('has-unread');
    } else {
      badge.style.display = 'none';
      if (bellBtn) bellBtn.classList.remove('has-unread');
    }
  }

  /**
   * Abre/Fecha o dropdown de notificações
   */
  toggleDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    const isOpen = dropdown.classList.contains('active');
    if (isOpen) {
      dropdown.classList.remove('active');
    } else {
      this.generateNotifications();
      this.renderDropdown();
      dropdown.classList.add('active');
    }
  }

  closeDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.remove('active');
  }

  /**
   * Filtra as notificações exibidas no dropdown
   */
  setFilter(filterName) {
    this.activeFilter = filterName;
    this.renderDropdown();
  }

  /**
   * Renderiza o conteúdo interno do dropdown de notificações
   */
  renderDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    const unreadCount = this.notifications.filter(n => !n.isRead).length;

    let filtered = this.notifications;
    if (this.activeFilter !== 'all') {
      filtered = this.notifications.filter(n => n.type === this.activeFilter);
    }

    let itemsHtml = '';
    if (filtered.length === 0) {
      itemsHtml = `
        <div class="notification-empty-state">
          <div class="notification-empty-icon">
            <i class="fa-regular fa-bell-slash"></i>
          </div>
          <p class="notification-empty-text">Nenhuma notificação por aqui!</p>
          <span class="notification-empty-subtext">Você está totalmente em dia com suas tarefas e avisos.</span>
        </div>
      `;
    } else {
      itemsHtml = filtered.map(notif => {
        return `
          <div class="notification-item ${notif.isRead ? 'read' : 'unread'}" onclick="app.notificationsModule.handleItemClick('${notif.id}')">
            <div class="notif-item-icon" style="background-color: ${notif.iconColor}18; color: ${notif.iconColor};">
              <i class="${notif.icon}"></i>
            </div>
            <div class="notif-item-body">
              <div class="notif-item-header">
                <span class="notif-item-title">${this.app.escapeHTML(notif.title)}</span>
                <span class="notif-item-date">${this.app.escapeHTML(notif.date)}</span>
              </div>
              <p class="notif-item-desc">${this.app.escapeHTML(notif.message)}</p>
            </div>
            ${!notif.isRead ? '<span class="notif-unread-dot" title="Não lida"></span>' : ''}
          </div>
        `;
      }).join('');
    }

    dropdown.innerHTML = `
      <div class="notification-header">
        <div class="notif-header-title-box">
          <h4 class="notif-header-title"><i class="fa-solid fa-bell"></i> Notificações & Avisos</h4>
          ${unreadCount > 0 ? `<span class="notif-header-pill">${unreadCount} nova${unreadCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        ${unreadCount > 0 ? `
          <button class="btn-notif-mark-all" onclick="app.notificationsModule.markAllAsRead(event)">
            <i class="fa-solid fa-check-double"></i> Marcar lidas
          </button>
        ` : ''}
      </div>

      <div class="notification-filters">
        <button class="notif-filter-btn ${this.activeFilter === 'all' ? 'active' : ''}" onclick="app.notificationsModule.setFilter('all')">
          Todas (${this.notifications.length})
        </button>
        <button class="notif-filter-btn ${this.activeFilter === 'academic' ? 'active' : ''}" onclick="app.notificationsModule.setFilter('academic')">
          <i class="fa-solid fa-graduation-cap"></i> Acadêmico
        </button>
        <button class="notif-filter-btn ${this.activeFilter === 'finance' ? 'active' : ''}" onclick="app.notificationsModule.setFilter('finance')">
          <i class="fa-solid fa-receipt"></i> Financeiro
        </button>
        <button class="notif-filter-btn ${this.activeFilter === 'notice' ? 'active' : ''}" onclick="app.notificationsModule.setFilter('notice')">
          <i class="fa-solid fa-bullhorn"></i> Avisos
        </button>
      </div>

      <div class="notification-list">
        ${itemsHtml}
      </div>

      <div class="notification-footer">
        <span class="notif-footer-text"><i class="fa-solid fa-shield-halved"></i> Atualizações automáticas em tempo real</span>
      </div>
    `;
  }

  /**
   * Trata o clique em um item de notificação
   */
  handleItemClick(notifId) {
    const notif = this.notifications.find(n => n.id === notifId);
    if (!notif) return;

    this.markAsRead(notifId);
    this.closeDropdown();

    if (notif.actionCustom === 'studentCard') {
      if (this.app.openStudentCardModal) {
        this.app.openStudentCardModal();
      }
      return;
    }

    if (notif.actionTab) {
      this.app.switchTab(notif.actionTab);
    }
  }

  /**
   * Marca uma notificação individual como lida
   */
  markAsRead(notifId) {
    const readIds = this.getReadNotificationIds();
    if (!readIds.includes(notifId)) {
      readIds.push(notifId);
      this.saveReadNotificationIds(readIds);
    }

    const notif = this.notifications.find(n => n.id === notifId);
    if (notif) notif.isRead = true;

    this.updateBadge();
    this.renderDropdown();
  }

  /**
   * Marca todas as notificações como lidas
   */
  markAllAsRead(event) {
    if (event) event.stopPropagation();
    const readIds = this.getReadNotificationIds();
    this.notifications.forEach(n => {
      if (!readIds.includes(n.id)) readIds.push(n.id);
      n.isRead = true;
    });

    this.saveReadNotificationIds(readIds);
    this.updateBadge();
    this.renderDropdown();
    this.app.showToast('Todas as notificações foram marcadas como lidas.', 'info');
  }
}
