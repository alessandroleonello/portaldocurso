/**
 * users.js - Módulo de Gestão de Usuários & Máscaras de Cadastro
 * Portal do Curso
 */

export class UsersModule {
  constructor(app) {
    this.app = app;
  }

  get state() {
    return this.app.state;
  }

  /* =========================================================================
     MÁSCARAS DE ENTRADA (PADRÃO BRASILEIRO)
     ========================================================================= */

  /**
   * Aplica máscara de CPF: 000.000.000-00
   */
  maskCPF(el) {
    if (!el) return;
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) {
      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    } else if (v.length > 6) {
      v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    } else if (v.length > 3) {
      v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    }
    el.value = v;
  }

  /**
   * Aplica máscara de Telefone / WhatsApp: (00) 00000-0000 ou (00) 0000-0000
   */
  maskPhone(el) {
    if (!el) return;
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) {
      v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (v.length > 6) {
      v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4})$/, '($1) $2-$3');
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
    } else if (v.length > 0) {
      v = v.replace(/^(\d*)/, '($1');
    }
    el.value = v;
  }

  /**
   * Aplica máscara de Data no formato brasileiro: DD/MM/AAAA
   */
  maskDateBR(el) {
    if (!el) return;
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length >= 5) {
      v = v.replace(/^(\d{2})(\d{2})(\d{1,4})$/, '$1/$2/$3');
    } else if (v.length >= 3) {
      v = v.replace(/^(\d{2})(\d{1,2})$/, '$1/$2');
    }
    el.value = v;
  }

  /**
   * Valida se uma string no formato DD/MM/AAAA é uma data real
   */
  isValidDateBR(dateStr) {
    if (!dateStr || dateStr.length !== 10) return false;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
    if (year < 1920 || year > new Date().getFullYear()) return false;
    if (month < 1 || month > 12) return false;

    const daysInMonth = new Date(year, month, 0).getDate();
    return day >= 1 && day <= daysInMonth;
  }

  /**
   * Limpa formatação mantendo apenas dígitos (para comparações ou links)
   */
  cleanDigits(str) {
    return (str || '').replace(/\D/g, '');
  }

  /* =========================================================================
     IMPORTAÇÃO EM LOTE DE ALUNOS (CSV / PLANILHA EXCEL)
     ========================================================================= */
  openImportStudentsModal() {
    if (!this.app.checkPermission(['gestao', 'secretaria'], 'importar estudantes em lote')) return;
    const modal = document.getElementById('modal-import-students');
    const turmaSelect = document.getElementById('import-student-turma');
    const textarea = document.getElementById('import-csv-textarea');
    const fileInput = document.getElementById('import-file-input');
    const previewBox = document.getElementById('import-preview-box');
    const confirmBtn = document.getElementById('btn-confirm-import');

    if (!modal) return;

    if (textarea) textarea.value = '';
    if (fileInput) fileInput.value = '';
    if (previewBox) previewBox.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = true;

    this._pendingImportStudents = [];

    // Preencher turmas disponíveis da instituição ativa
    if (turmaSelect) {
      const activeSchool = this.app.getActiveSchool();
      const schoolId = activeSchool ? activeSchool.id : null;
      const turmas = (this.state.classes || []).filter(t => !schoolId || t.schoolId === schoolId);

      turmaSelect.innerHTML = `<option value="">Apenas cadastrar (Sem turma vinculada)</option>` +
        turmas.map(t => `<option value="${t.id}">${this.app.escapeHTML(t.nome)}</option>`).join('');
    }

    modal.classList.add('open');
  }

  downloadCsvTemplate() {
    const csvContent = "Nome;E-mail;CPF;Telefone\nMariana Silva;mariana@exemplo.com;123.456.789-00;(11) 98765-4321\nLucas Santos;lucas@exemplo.com;234.567.890-11;(11) 97654-3210\nBeatriz Oliveira;beatriz@exemplo.com;345.678.901-22;(11) 96543-2109\n";
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_importacao_alunos_portal.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  handleImportCsvFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const textarea = document.getElementById('import-csv-textarea');
      if (textarea) {
        textarea.value = content;
        this.previewImportedStudents();
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  parseCsvContent(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.trim().split(/\r?\n/);
    const results = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Pular cabeçalho se houver
      if (i === 0 && (line.toLowerCase().includes('nome') || line.toLowerCase().includes('email'))) {
        continue;
      }

      // Suporte a separadores: tabulação (\t), ponto-e-vírgula (;) ou vírgula (,)
      let parts = [];
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(';')) parts = line.split(';');
      else parts = line.split(',');

      const nome = (parts[0] || '').trim();
      const email = (parts[1] || '').trim();
      const cpf = (parts[2] || '').trim();
      const telefone = (parts[3] || '').trim();

      if (nome && nome.length >= 2) {
        results.push({ nome, email, cpf, telefone });
      }
    }

    return results;
  }

  previewImportedStudents() {
    const textarea = document.getElementById('import-csv-textarea');
    const previewBox = document.getElementById('import-preview-box');
    const tbody = document.getElementById('import-preview-tbody');
    const badge = document.getElementById('import-count-badge');
    const confirmBtn = document.getElementById('btn-confirm-import');

    if (!textarea || !previewBox || !tbody) return;

    const students = this.parseCsvContent(textarea.value);
    this._pendingImportStudents = students;

    if (students.length === 0) {
      previewBox.style.display = 'none';
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }

    previewBox.style.display = 'block';
    if (confirmBtn) confirmBtn.disabled = false;
    if (badge) badge.textContent = `${students.length} aluno${students.length > 1 ? 's' : ''} identificado${students.length > 1 ? 's' : ''}`;

    tbody.innerHTML = students.slice(0, 50).map((st, idx) => `
      <tr>
        <td style="font-weight:700; color:var(--text-muted);">${idx + 1}</td>
        <td><strong>${this.app.escapeHTML(st.nome)}</strong></td>
        <td>${this.app.escapeHTML(st.email || '-')}</td>
        <td>${this.app.escapeHTML(st.cpf || '-')}</td>
        <td>${this.app.escapeHTML(st.telefone || '-')}</td>
      </tr>
    `).join('') + (students.length > 50 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">... e mais ${students.length - 50} alunos</td></tr>` : '');
  }

  executeImportStudents() {
    const students = this._pendingImportStudents || [];
    if (students.length === 0) {
      this.app.showToast('Nenhum dado válido para importação.', 'warning');
      return;
    }

    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;
    const turmaSelect = document.getElementById('import-student-turma');
    const targetTurmaId = turmaSelect ? turmaSelect.value : '';

    if (!this.state.users) this.state.users = [];

    const targetTurma = targetTurmaId ? (this.state.classes || []).find(t => t.id === targetTurmaId) : null;
    if (targetTurma && !targetTurma.studentIds) targetTurma.studentIds = [];

    let importedCount = 0;

    students.forEach(st => {
      const generatedRa = this.app.generateNextRA();
      const newStudent = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        ra: generatedRa,
        nome: st.nome,
        email: st.email || `${st.nome.toLowerCase().replace(/\s+/g, '.')}${Math.floor(Math.random()*100)}@escola.com`,
        cpf: st.cpf || '',
        telefone: st.telefone || '',
        tipo: 'aluno',
        schoolId: schoolId,
        status: 'ativo',
        criadoEm: new Date().toISOString()
      };

      this.state.users.push(newStudent);

      if (targetTurma) {
        if (!targetTurma.studentIds.includes(newStudent.id)) {
          targetTurma.studentIds.push(newStudent.id);
        }
      }

      importedCount++;
    });

    this.app.saveState();
    this.app.closeModal('modal-import-students');
    this.app.showToast(`${importedCount} estudantes importados com sucesso com geração de RAs automáticos!`, 'success', 'Importação Concluída');
    this.app.render();
  }
}
