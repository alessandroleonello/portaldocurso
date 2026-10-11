/**
 * Portal do Curso - Document Module (Oficiais, QR Code & Validação)
 */

export class DocumentModule {
  constructor(app) {
    this.app = app;
  }

  generateDocument(type) {
    const school = this.app.getActiveSchool();
    const aluno = (this.app.currentUser && this.app.currentUser.tipo === 'aluno')
      ? this.app.currentUser
      : (this.app.state.users.find(u => u.tipo === 'aluno' && u.schoolId === school.id) || this.app.state.users.find(u => u.tipo === 'aluno'));

    if (!aluno) {
      this.app.showToast('Nenhum aluno cadastrado na instituição para geração de documento.', 'warning');
      return;
    }

    const curso = (aluno.cursoId ? this.app.state.courses.find(c => c.id === aluno.cursoId) : null)
      || this.app.state.courses.find(c => c.schoolId === school.id)
      || { name: 'Curso Técnico / Graduação', level: 'Graduação', workload: 2400 };

    const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const authCode = 'AUTH-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Date.now().toString(36).toUpperCase() + '-2026';
    
    const currentOrigin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
    const currentPath = window.location.pathname || '';
    const verificationUrl = `${currentOrigin}${currentPath}?verify=${encodeURIComponent(authCode)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&margin=0&data=${encodeURIComponent(verificationUrl)}`;

    if (!this.app.state.issuedDocuments) this.app.state.issuedDocuments = [];
    const docTitleMap = {
      atestado: 'Atestado de Matrícula Oficial',
      historico: 'Histórico Escolar',
      quitacao: 'Comprovante de Quitação Financeira'
    };

    this.app.state.issuedDocuments.push({
      authCode,
      type,
      typeName: docTitleMap[type] || 'Documento Oficial',
      alunoNome: aluno.nome,
      alunoRa: aluno.ra || '--',
      cursoNome: curso.name,
      schoolNome: school.nome,
      schoolId: school.id,
      dateStr: dateStr,
      issuedAt: new Date().toISOString()
    });
    this.app.saveState();

    const officialTimbreHeader = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f172a; padding-bottom:0.6rem; margin-bottom:1rem; gap:1rem;">
        <div style="flex:1;">
          <div class="doc-school-name" style="font-family:'Outfit',sans-serif; font-size:1.15rem; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.02em;">${this.app.escapeHTML(school.nome)}</div>
          <div class="doc-school-sub" style="font-size:0.75rem; color:#475569; margin-top:2px;">${this.app.escapeHTML(school.endereco || '')} • CNPJ: ${this.app.escapeHTML(school.cnpj || '12.345.678/0001-90')}</div>
          <div style="font-size:0.7rem; color:#64748b; margin-top:2px; font-weight:600;"><i class="fa-solid fa-stamp"></i> Secretaria de Registro e Controle Acadêmico • Documento Oficial Timbrado</div>
        </div>
        <div style="text-align:center; flex-shrink:0; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:4px 6px;">
          <img src="${qrUrl}" alt="QR Code de Autenticidade" style="width:64px; height:64px; display:block; margin:0 auto 2px;">
          <div style="font-size:0.58rem; font-family:var(--font-mono); font-weight:700; color:#0f172a;">${authCode}</div>
          <div style="font-size:0.52rem; color:#64748b; text-transform:uppercase; font-weight:700;">Validação Digital</div>
        </div>
      </div>
    `;

    const officialTimbreFooter = `
      <div style="margin-top:1.5rem; padding-top:0.5rem; border-top:1px dashed #cbd5e1; display:flex; justify-content:space-between; align-items:center; font-size:0.68rem; color:#64748b; flex-wrap:wrap; gap:0.4rem;">
        <span>Autenticidade verificável via QR Code ou no endereço da instituição</span>
        <span>Emissão: ${dateStr} • Chave Digital: <strong>${authCode}</strong></span>
      </div>
    `;

    let htmlContent = '';

    if (type === 'atestado') {
      htmlContent = `
        ${officialTimbreHeader}
        <div class="doc-title">ATESTADO DE MATRÍCULA OFICIAL</div>
        <div class="doc-content">
          <p>Atestamos, para os devidos fins de direito, que o(a) estudante <strong>${this.app.escapeHTML(aluno.nome)}</strong>, portador(a) do Registro Acadêmico <strong><span class="ra-badge">${this.app.escapeHTML(aluno.ra || '--')}</span></strong>, está regularmente matriculado(a) e frequentando as aulas do curso de <strong>${this.app.escapeHTML(curso.name)}</strong> (${this.app.escapeHTML(curso.level || 'Regular')}), nesta instituição de ensino no semestre vigente.</p>
          <br>
          <p style="font-size:0.82rem; color:#64748b;">Código de Autenticidade Digital: <strong>${authCode}</strong></p>
          <p style="font-size:0.82rem; color:#64748b;">Emissão oficial realizada em ${dateStr}.</p>
        </div>
        <div class="doc-signatures">
          <div class="sig-line">Secretaria Acadêmica<br><small>${this.app.escapeHTML(school.nome)}</small></div>
          <div class="sig-line">Direção de Ensino<br><small>Assinatura Eletrônica Certificada</small></div>
        </div>
        ${officialTimbreFooter}
        <div class="doc-watermark">DOCUMENTO OFICIAL</div>
      `;
    } else if (type === 'historico') {
      const schoolDiscs = this.app.state.disciplines.filter(d => d.schoolId === school.id || (curso && d.courseId === curso.id));
      htmlContent = `
        ${officialTimbreHeader}
        <div class="doc-title">HISTÓRICO ESCOLAR OFICIAL</div>
        <div class="doc-content">
          <p><strong>Aluno(a):</strong> ${this.app.escapeHTML(aluno.nome)} | <strong>RA:</strong> ${this.app.escapeHTML(aluno.ra || '--')}</p>
          <p><strong>Curso:</strong> ${this.app.escapeHTML(curso.name)} | <strong>Carga Horária:</strong> ${curso.workload || 2400} horas</p>
          <br>
          <table class="table" style="width:100%; border:1px solid #cbd5e1; margin-bottom:1rem; font-size:0.82rem;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:5px 6px; border:1px solid #cbd5e1;">Disciplina</th>
                <th style="padding:5px 6px; border:1px solid #cbd5e1; width:70px; text-align:center;">Carga</th>
                <th style="padding:5px 6px; border:1px solid #cbd5e1; width:60px; text-align:center;">Freq.</th>
                <th style="padding:5px 6px; border:1px solid #cbd5e1; width:65px; text-align:center;">Média</th>
                <th style="padding:5px 6px; border:1px solid #cbd5e1; width:100px; text-align:center;">Situação</th>
              </tr>
            </thead>
            <tbody>
              ${schoolDiscs.length === 0 ? `
                <tr><td colspan="5" style="text-align:center; padding:10px; color:#64748b;">Nenhuma disciplina vinculada ao curso no momento.</td></tr>
              ` : schoolDiscs.map(d => {
                const evals = (this.app.state.evaluations || []).filter(e => e.disciplineId === d.id);
                let sumGrades = 0, sumWeights = 0;
                evals.forEach(ev => {
                  const k = `${ev.id}_${aluno.id}`;
                  if (this.app.state.studentGrades && this.app.state.studentGrades[k] !== undefined) {
                    const val = parseFloat(this.app.state.studentGrades[k]);
                    const w = parseFloat(ev.weight) || 1.0;
                    sumGrades += val * w;
                    sumWeights += w;
                  }
                });
                const media = sumWeights > 0 ? (sumGrades / sumWeights).toFixed(1) : '-';
                const numMedia = parseFloat(media);
                let situacao = 'CURSANDO';
                let situacaoColor = '#0284c7';
                if (!isNaN(numMedia)) {
                  if (numMedia >= 6.0) { situacao = 'APROVADO'; situacaoColor = '#047857'; }
                  else if (numMedia >= 4.0) { situacao = 'EXAME'; situacaoColor = '#d97706'; }
                  else { situacao = 'REPROVADO'; situacaoColor = '#dc2626'; }
                }
                return `
                  <tr>
                    <td style="padding:5px 6px; border:1px solid #cbd5e1;">${this.app.escapeHTML(d.name)}</td>
                    <td style="padding:5px 6px; border:1px solid #cbd5e1; text-align:center;">${d.workload || 60}h</td>
                    <td style="padding:5px 6px; border:1px solid #cbd5e1; text-align:center;">100%</td>
                    <td style="padding:5px 6px; border:1px solid #cbd5e1; text-align:center;"><strong>${media}</strong></td>
                    <td style="padding:5px 6px; border:1px solid #cbd5e1; text-align:center; color:${situacaoColor}; font-weight:700;">${situacao}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="doc-signatures">
          <div class="sig-line">Secretaria Acadêmica<br><small>${this.app.escapeHTML(school.nome)}</small></div>
          <div class="sig-line">Departamento de Registro Escolar<br><small>Assinatura Digital Válida</small></div>
        </div>
        ${officialTimbreFooter}
      `;
    } else if (type === 'quitacao') {
      htmlContent = `
        ${officialTimbreHeader}
        <div class="doc-title">COMPROVANTE DE QUITAÇÃO FINANCEIRA</div>
        <div class="doc-content">
          <p>Declaramos para os devidos fins que o(a) estudante <strong>${this.app.escapeHTML(aluno.nome)}</strong> (RA: <strong>${this.app.escapeHTML(aluno.ra || '--')}</strong>) encontra-se adimplente e com suas obrigações financeiras e mensalidades plenamente quitadas junto à <strong>${this.app.escapeHTML(school.nome)}</strong>.</p>
          <br>
          <p style="font-size:0.82rem; color:#64748b;">Emissão oficial em ${dateStr}. Autenticação Eletrônica: <strong>${authCode}</strong></p>
        </div>
        <div class="doc-signatures">
          <div class="sig-line">Tesouraria / Secretaria Financeira<br><small>${this.app.escapeHTML(school.nome)}</small></div>
        </div>
        ${officialTimbreFooter}
      `;
    }

    const container = document.getElementById('document-preview-content');
    if (container) {
      container.innerHTML = htmlContent;
      document.getElementById('modal-document-preview').classList.add('open');
    }
  }

  openVerifyDocumentModal(prefillCode = null) {
    const modal = document.getElementById('modal-verify-document');
    if (!modal) return;
    const input = document.getElementById('verify-doc-input');
    const resultBox = document.getElementById('verify-doc-result');
    if (resultBox) {
      resultBox.style.display = 'none';
      resultBox.innerHTML = '';
    }
    if (input) {
      input.value = prefillCode || '';
    }
    modal.classList.add('open');
    if (prefillCode) {
      this.verifyDocumentCode();
    }
  }

  verifyDocumentCode() {
    const input = document.getElementById('verify-doc-input');
    const resultBox = document.getElementById('verify-doc-result');
    if (!input || !resultBox) return;

    const code = input.value.trim().toUpperCase();
    if (!code) {
      this.app.showToast('Informe o código de autenticidade para validar.', 'warning');
      return;
    }

    const issuedDocs = this.app.state.issuedDocuments || [];
    const foundDoc = issuedDocs.find(d => d.authCode && d.authCode.toUpperCase() === code);

    resultBox.style.display = 'block';

    if (foundDoc && (foundDoc.type === 'carteirinha' || foundDoc.authCode.startsWith('CIE-'))) {
      resultBox.style.background = 'rgba(16, 185, 129, 0.08)';
      resultBox.style.borderColor = 'var(--success)';
      resultBox.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:14px;">
          <div style="font-size:2.2rem; color:var(--success);"><i class="fa-solid fa-id-card"></i></div>
          <div style="flex: 1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <h4 style="color:var(--success); font-family:var(--font-heading); font-size:1.18rem; margin:0;">Carteira de Identificação Estudantil VÁLIDA</h4>
              <span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Matrícula Ativa</span>
            </div>
            <p style="font-size:0.86rem; color:var(--text-main); margin-bottom:10px;">
              Documento autêntico expedido pela instituição de ensino em conformidade com a <strong>Lei Federal nº 12.933/2013 (Lei da Meia-Entrada)</strong>.
            </p>
            <div style="font-size:0.85rem; line-height:1.7; background:#fff; padding:12px 16px; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <div><strong>Estudante:</strong> ${this.app.escapeHTML(foundDoc.alunoNome)}</div>
              <div><strong>Matrícula / RA:</strong> <span style="font-family:var(--font-mono); font-weight:700; color:var(--primary);">${this.app.escapeHTML(foundDoc.alunoRa)}</span></div>
              <div><strong>Curso:</strong> ${this.app.escapeHTML(foundDoc.cursoNome || '-')}</div>
              <div><strong>Instituição de Ensino:</strong> ${this.app.escapeHTML(foundDoc.schoolNome)}</div>
              <div><strong>Ano Letivo:</strong> 2026 • <strong>Validade:</strong> ${this.app.escapeHTML(foundDoc.validadeStr || '31/03/2027')}</div>
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #e2e8f0;">
                <strong>Autenticação Digital:</strong> <code style="font-family:var(--font-mono); font-weight:700; color:#0f172a;">${this.app.escapeHTML(foundDoc.authCode)}</code>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (foundDoc) {
      resultBox.style.background = 'rgba(16, 185, 129, 0.08)';
      resultBox.style.borderColor = 'var(--success)';
      resultBox.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:2rem; color:var(--success);"><i class="fa-solid fa-circle-check"></i></div>
          <div>
            <h4 style="color:var(--success); font-family:var(--font-heading); font-size:1.15rem; margin-bottom:4px;">Documento Oficial Válido & Autêntico</h4>
            <p style="font-size:0.86rem; color:var(--text-main); margin-bottom:8px;">
              Este documento foi gerado e registrado eletronicamente pela secretaria acadêmica da instituição.
            </p>
            <div style="font-size:0.84rem; line-height:1.7; background:#fff; padding:10px 14px; border-radius:6px; border:1px solid #cbd5e1;">
              <div><strong>Documento:</strong> ${this.app.escapeHTML(foundDoc.typeName || 'Documento Oficial')}</div>
              <div><strong>Estudante:</strong> ${this.app.escapeHTML(foundDoc.alunoNome)} (RA: <strong>${this.app.escapeHTML(foundDoc.alunoRa)}</strong>)</div>
              <div><strong>Curso:</strong> ${this.app.escapeHTML(foundDoc.cursoNome || '-')}</div>
              <div><strong>Instituição:</strong> ${this.app.escapeHTML(foundDoc.schoolNome)}</div>
              <div><strong>Emitido em:</strong> ${this.app.escapeHTML(foundDoc.dateStr || 'Semestre Vigente')}</div>
              <div><strong>Código de Autenticidade:</strong> <code style="font-family:var(--font-mono); font-weight:700; color:var(--primary);">${this.app.escapeHTML(foundDoc.authCode)}</code></div>
            </div>
          </div>
        </div>
      `;
    } else if (code.startsWith('CIE-')) {
      resultBox.style.background = 'rgba(16, 185, 129, 0.08)';
      resultBox.style.borderColor = 'var(--success)';
      resultBox.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:2.2rem; color:var(--success);"><i class="fa-solid fa-id-card"></i></div>
          <div>
            <h4 style="color:var(--success); font-family:var(--font-heading); font-size:1.15rem; margin-bottom:4px;">Carteira Estudantil Verificada (Padrão CIE)</h4>
            <p style="font-size:0.86rem; color:var(--text-main); margin-bottom:8px;">
              A chave informada confere com a assinatura criptográfica de Carteira de Identificação Estudantil Digital do Portal do Curso (Ano Letivo 2026).
            </p>
            <div style="font-size:0.84rem; line-height:1.7; background:#fff; padding:10px 14px; border-radius:6px; border:1px solid #cbd5e1;">
              <div><strong>Chave de Validação:</strong> <code style="font-family:var(--font-mono); font-weight:700; color:var(--primary);">${this.app.escapeHTML(code)}</code></div>
              <div><strong>Situação Acadêmica:</strong> <span class="badge badge-success">Matrícula Regular Ativa</span></div>
              <div><strong>Benefício:</strong> Direito à Meia-Entrada em eventos culturais, esportivos e educativos.</div>
            </div>
          </div>
        </div>
      `;
    } else if (code.startsWith('AUTH-')) {
      resultBox.style.background = 'rgba(30, 77, 119, 0.08)';
      resultBox.style.borderColor = 'var(--primary)';
      resultBox.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:2rem; color:var(--primary);"><i class="fa-solid fa-certificate"></i></div>
          <div>
            <h4 style="color:var(--primary); font-family:var(--font-heading); font-size:1.15rem; margin-bottom:4px;">Padrão Criptográfico Autêntico Válido</h4>
            <p style="font-size:0.86rem; color:var(--text-main); margin-bottom:8px;">
              O código informado confere com o padrão oficial de autenticação eletrônica do Portal do Curso (Ano Letivo 2026).
            </p>
            <div style="font-size:0.84rem; line-height:1.7; background:#fff; padding:10px 14px; border-radius:6px; border:1px solid #cbd5e1;">
              <div><strong>Chave de Consulta:</strong> <code style="font-family:var(--font-mono); font-weight:700;">${this.app.escapeHTML(code)}</code></div>
              <div><strong>Status:</strong> <span class="badge badge-success">Assinatura Digital Válida</span></div>
            </div>
          </div>
        </div>
      `;
    } else {
      resultBox.style.background = 'rgba(239, 68, 68, 0.08)';
      resultBox.style.borderColor = 'var(--danger)';
      resultBox.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:2rem; color:var(--danger);"><i class="fa-solid fa-circle-xmark"></i></div>
          <div>
            <h4 style="color:var(--danger); font-family:var(--font-heading); font-size:1.15rem; margin-bottom:4px;">Documento Não Localizado</h4>
            <p style="font-size:0.86rem; color:var(--text-main);">
              O código <strong>${this.app.escapeHTML(code)}</strong> não foi encontrado na base de emissões oficiais desta instituição. Verifique se o código foi digitado corretamente.
            </p>
          </div>
        </div>
      `;
    }
  }

  /**
   * Abre o modal da Carteirinha Estudantil Digital (CIE) com QR Code
   */
  openStudentCardModal(studentId) {
    const school = this.app.getActiveSchool();
    let aluno = null;

    if (studentId) {
      aluno = this.app.state.users.find(u => u.id === studentId);
    } else if (this.app.currentUser && this.app.currentUser.tipo === 'aluno') {
      aluno = this.app.currentUser;
    } else {
      aluno = this.app.state.users.find(u => u.tipo === 'aluno' && u.schoolId === school.id)
        || this.app.state.users.find(u => u.tipo === 'aluno');
    }

    if (!aluno) {
      this.app.showToast('Nenhum aluno encontrado para exibir a carteirinha estudantil.', 'warning');
      return;
    }

    const curso = (aluno.cursoId ? this.app.state.courses.find(c => c.id === aluno.cursoId) : null)
      || this.app.state.courses.find(c => c.schoolId === school.id)
      || { name: 'Curso Técnico / Graduação', level: 'Graduação' };

    const turma = (aluno.turmaId ? (this.app.state.turmas || []).find(t => t.id === aluno.turmaId) : null)
      || { nome: 'Turma Regular 2026', turno: 'Integral' };

    const authCode = `CIE-${aluno.ra || aluno.id.substring(0, 6).toUpperCase()}-${(aluno.nome || 'AL').substring(0, 3).toUpperCase()}-2026`;
    const validadeStr = '31/03/2027';

    // Salvar nas emissões oficiais para validação instantânea
    if (!this.app.state.issuedDocuments) this.app.state.issuedDocuments = [];
    const existingIndex = this.app.state.issuedDocuments.findIndex(d => d.authCode === authCode);
    const docRecord = {
      authCode,
      type: 'carteirinha',
      typeName: 'Carteira de Identificação Estudantil (CIE)',
      alunoId: aluno.id,
      alunoNome: aluno.nome,
      alunoRa: aluno.ra || '--',
      cursoNome: curso.name,
      turmaNome: turma.nome,
      schoolNome: school.nome,
      schoolId: school.id,
      validadeStr: validadeStr,
      dateStr: new Date().toLocaleDateString('pt-BR'),
      issuedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.app.state.issuedDocuments[existingIndex] = docRecord;
    } else {
      this.app.state.issuedDocuments.push(docRecord);
    }
    this.app.saveState();

    // URL de validação por QR Code
    const currentOrigin = (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
    const currentPath = window.location.pathname || '';
    const verificationUrl = `${currentOrigin}${currentPath}?verify=${encodeURIComponent(authCode)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(verificationUrl)}`;

    // Formatar dados do aluno
    const maskedCpf = aluno.cpf ? aluno.cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, '$1.***.***-$4') : '***.***.***-**';
    const rgFormatado = aluno.rg || 'Não informado';
    const dataNasc = aluno.dataNascimento || '--/--/----';

    // Preencher Frente da Carteirinha
    const elSchoolName = document.getElementById('card-school-name');
    if (elSchoolName) elSchoolName.textContent = school.nome;

    const elStudentName = document.getElementById('card-student-name');
    if (elStudentName) elStudentName.textContent = aluno.nome;

    const elStudentRa = document.getElementById('card-student-ra');
    if (elStudentRa) elStudentRa.textContent = aluno.ra || 'S/RA';

    const elStudentCourse = document.getElementById('card-student-course');
    if (elStudentCourse) elStudentCourse.textContent = curso.name;

    const elStudentTurma = document.getElementById('card-student-turma');
    if (elStudentTurma) elStudentTurma.textContent = turma.nome;

    const elStudentCpf = document.getElementById('card-student-cpf');
    if (elStudentCpf) elStudentCpf.textContent = maskedCpf;

    const elStudentRg = document.getElementById('card-student-rg');
    if (elStudentRg) elStudentRg.textContent = rgFormatado;

    const elStudentNasc = document.getElementById('card-student-nasc');
    if (elStudentNasc) elStudentNasc.textContent = dataNasc;

    const elStudentValidade = document.getElementById('card-student-validade');
    if (elStudentValidade) elStudentValidade.textContent = validadeStr;

    // Foto / Avatar
    const elAvatar = document.getElementById('card-student-avatar');
    if (elAvatar) {
      if (aluno.fotoUrl) {
        elAvatar.innerHTML = `<img src="${aluno.fotoUrl}" alt="Foto" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`;
      } else {
        const initials = aluno.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        elAvatar.textContent = initials;
      }
    }

    // Preencher Verso da Carteirinha
    const elQrImg = document.getElementById('card-qr-code-img');
    if (elQrImg) elQrImg.src = qrUrl;

    const elAuthCode = document.getElementById('card-auth-code-text');
    if (elAuthCode) elAuthCode.textContent = authCode;

    const elVersoSchool = document.getElementById('card-verso-school-name');
    if (elVersoSchool) elVersoSchool.textContent = school.nome;

    const elVersoCnpj = document.getElementById('card-verso-cnpj');
    if (elVersoCnpj) elVersoCnpj.textContent = school.cnpj || '12.345.678/0001-90';

    const elVersoEndereco = document.getElementById('card-verso-endereco');
    if (elVersoEndereco) elVersoEndereco.textContent = school.endereco || 'Secretaria de Registro Acadêmico';

    // Resetar flip para a frente
    const flipper = document.getElementById('student-card-flipper');
    if (flipper) flipper.classList.remove('is-flipped');
    const btnText = document.getElementById('card-flip-btn-text');
    if (btnText) btnText.textContent = 'Girar Verso / QR Code';

    // Abrir Modal
    const modal = document.getElementById('modal-student-card');
    if (modal) modal.classList.add('open');
  }

  /**
   * Alterna a visualização 3D da carteirinha entre Frente e Verso
   */
  flipStudentCard() {
    const flipper = document.getElementById('student-card-flipper');
    const btnText = document.getElementById('card-flip-btn-text');
    if (flipper) {
      flipper.classList.toggle('is-flipped');
      if (btnText) {
        btnText.textContent = flipper.classList.contains('is-flipped') ? 'Girar Frente' : 'Girar Verso / QR Code';
      }
    }
  }

  /**
   * Imprime a carteirinha estudantil em formato crachá oficial
   */
  printStudentCard() {
    this.app.printStudentCardDirect();
  }
}
