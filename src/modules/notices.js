/**
 * Portal do Curso - Notice Module (Mural de Avisos Institucionais)
 */

export class NoticeModule {
  constructor(app) {
    this.app = app;
  }

  renderDashboardNotices() {
    const container = document.getElementById('dashboard-notices-feed');
    if (!container) return;

    const school = this.app.getActiveSchool();
    const schoolId = school ? school.id : null;
    const notices = (this.app.state.notices || []).filter(n => {
      if (n.schoolId && schoolId && n.schoolId !== schoolId) return false;
      if (this.app.currentRole === 'aluno' && n.target === 'professores') return false;
      if (this.app.currentRole === 'professor' && n.target === 'alunos') return false;
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (notices.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-bullhorn" style="font-size: 2.2rem; opacity: 0.35; margin-bottom: 0.5rem; display: block;"></i>
          <p style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.25rem;">Nenhum comunicado no mural no momento</p>
          <span style="font-size: 0.82rem;">Avisos institucionais, datas de provas e eventos acadêmicos serão listados aqui.</span>
        </div>
      `;
      return;
    }

    const canManageNotices = (this.app.currentRole === 'gestao' || this.app.currentRole === 'secretaria' || this.app.currentRole === 'professor');

    const categoryBadges = {
      geral: { text: 'Aviso Geral', class: 'notice-badge-geral', icon: 'fa-info-circle' },
      urgente: { text: 'Urgente / Importante', class: 'notice-badge-urgente', icon: 'fa-triangle-exclamation' },
      evento: { text: 'Evento Acadêmico', class: 'notice-badge-evento', icon: 'fa-calendar-star' },
      avaliacao: { text: 'Avaliações & Calendário', class: 'notice-badge-avaliacao', icon: 'fa-clock' }
    };

    container.innerHTML = `
      <div class="notice-feed-list">
        ${notices.map(n => {
          const cat = categoryBadges[n.category] || categoryBadges.geral;
          const isUrgent = n.category === 'urgente';
          const cardClass = isUrgent ? 'urgent' : (n.category === 'evento' ? 'event' : (n.category === 'avaliacao' ? 'exam' : ''));
          const dateBR = n.createdAt ? new Date(n.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          
          return `
            <div class="notice-card ${cardClass}">
              <div class="notice-header">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span class="notice-badge ${cat.class}">
                    <i class="fa-solid ${cat.icon}"></i> ${cat.text}
                  </span>
                  <h4 class="notice-title">${this.app.escapeHTML(n.title)}</h4>
                </div>
                ${canManageNotices ? `
                  <button type="button" class="action-btn-circle delete-btn" onclick="app.deleteNotice('${n.id}')" title="Excluir comunicado" style="width: 28px; height: 28px; font-size: 0.75rem;">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
              <div class="notice-body">${this.app.escapeHTML(n.message)}</div>
              <div class="notice-meta">
                <span><i class="fa-solid fa-user-pen"></i> Publicado por <strong>${this.app.escapeHTML(n.authorName || 'Coordenação')}</strong> (${this.app.escapeHTML(n.authorRole || 'Instituição')})</span>
                <span><i class="fa-regular fa-clock"></i> ${dateBR}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  openNoticeModal() {
    if (!this.app.checkPermission(['gestao', 'secretaria', 'professor'], 'publicar comunicados')) return;
    const titleInput = document.getElementById('notice-title');
    const msgInput = document.getElementById('notice-message');
    const catInput = document.getElementById('notice-category');
    const targetInput = document.getElementById('notice-target');

    if (titleInput) titleInput.value = '';
    if (msgInput) msgInput.value = '';
    if (catInput) catInput.value = 'geral';
    if (targetInput) targetInput.value = 'todos';

    document.getElementById('modal-notice').classList.add('open');
  }

  handleSaveNotice(e) {
    e.preventDefault();
    if (!this.app.checkPermission(['gestao', 'secretaria', 'professor'], 'publicar comunicados')) return;

    const title = document.getElementById('notice-title')?.value.trim();
    const message = document.getElementById('notice-message')?.value.trim();
    const category = document.getElementById('notice-category')?.value || 'geral';
    const target = document.getElementById('notice-target')?.value || 'todos';

    if (!title || !message) {
      this.app.showToast('Por favor, preencha o título e a mensagem do comunicado.', 'warning');
      return;
    }

    if (!this.app.state.notices) this.app.state.notices = [];

    const activeSchool = this.app.getActiveSchool();
    const newNotice = {
      id: 'not_' + Date.now(),
      schoolId: activeSchool ? activeSchool.id : null,
      title,
      message,
      category,
      target,
      authorName: this.app.currentUser ? this.app.currentUser.nome : 'Coordenação Pedagógica',
      authorRole: this.app.currentRole,
      createdAt: new Date().toISOString()
    };

    this.app.state.notices.unshift(newNotice);
    this.app.saveState();
    this.app.closeModal('modal-notice');
    this.app.showToast('Comunicado publicado com sucesso no mural!', 'success');
    this.renderDashboardNotices();
    if (this.app.currentRole === 'aluno') this.app.renderMeuCurso();
  }

  async deleteNotice(id) {
    const confirmed = await this.app.confirmAction({
      title: 'Excluir Comunicado',
      message: 'Deseja realmente remover este comunicado do mural da instituição?',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.app.state.notices = (this.app.state.notices || []).filter(n => n.id !== id);
      this.app.saveState();
      this.app.showToast('Comunicado removido com sucesso.', 'success');
      this.renderDashboardNotices();
      if (this.app.currentRole === 'aluno') this.app.renderMeuCurso();
    }
  }
}
