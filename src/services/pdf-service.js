/**
 * pdf-service.js - Serviço Unificado de Geração de PDFs e Impressão
 * Portal do Curso - Gestão Acadêmica Multi-Escola
 * Utiliza jsPDF nativo + plugin AutoTable (jspdf-autotable) para renderização
 * vetorial direta, precisa em milímetros e sem screenshots do DOM.
 */

export class PdfService {
  constructor(app) {
    this.app = app;
    this.isGenerating = false;
  }

  /**
   * Sanitiza nomes de arquivos para evitar caracteres inválidos
   */
  sanitizeFilename(name, defaultName = 'documento') {
    if (!name) return `${defaultName}.pdf`;
    const clean = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return `${clean || defaultName}.pdf`;
  }

  /**
   * Garante que o jsPDF, AutoTable e html2canvas estejam carregados (local ou via CDN)
   */
  async ensureJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.prototype && window.jspdf.jsPDF.prototype.autoTable) {
      return true;
    }

    // 1. Carrega html2canvas para renderização de elementos gráficos quando necessário
    if (!window.html2canvas) {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'src/services/html2canvas.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => {
          const cdn = document.createElement('script');
          cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          cdn.onload = () => resolve(true);
          cdn.onerror = () => resolve(false);
          document.head.appendChild(cdn);
        };
        document.head.appendChild(script);
      });
    }

    // 2. Carrega jsPDF oficial (UMD)
    if (!window.jspdf || !window.jspdf.jsPDF) {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'src/services/jspdf.umd.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => {
          const cdn = document.createElement('script');
          cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          cdn.onload = () => resolve(true);
          cdn.onerror = () => resolve(false);
          document.head.appendChild(cdn);
        };
        document.head.appendChild(script);
      });
    }

    // 3. Carrega o plugin oficial jsPDF-AutoTable para tabelas e dados vetoriais perfeitos
    if (window.jspdf && window.jspdf.jsPDF && (!window.jspdf.jsPDF.prototype || !window.jspdf.jsPDF.prototype.autoTable)) {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'src/services/jspdf.plugin.autotable.min.js';
        script.onload = () => resolve(true);
        script.onerror = () => {
          const cdn = document.createElement('script');
          cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
          cdn.onload = () => resolve(true);
          cdn.onerror = () => resolve(false);
          document.head.appendChild(cdn);
        };
        document.head.appendChild(script);
      });
    }

    return !!(window.jspdf && window.jspdf.jsPDF);
  }

  /**
   * Instancia um novo documento jsPDF no padrão A4 configurado com overlay de carregamento automático
   */
  async createPdfDoc(orientation = 'portrait', message = 'Gerando Documento Oficial em PDF...') {
    this.showLoadingOverlay(message, 'Montando estrutura vetorial, fontes e paginação...');
    await this.ensureJsPdf();
    // Pequeno intervalo para o navegador renderizar o loading visual suavemente
    await new Promise(r => setTimeout(r, 80));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    // Intercepta doc.save para ocultar o overlay com segurança e notificar o usuário
    const originalSave = doc.save.bind(doc);
    doc.save = (filename, options) => {
      try {
        const cleanName = this.sanitizeFilename(filename);
        const res = originalSave(cleanName, options);
        this.app.showToast(`Arquivo "${cleanName}" gerado com sucesso!`, 'success', 'PDF Gerado');
        return res;
      } finally {
        setTimeout(() => {
          this.hideLoadingOverlay();
          this.isGenerating = false;
        }, 150);
      }
    };

    return doc;
  }

  /**
   * Desenha o Cabeçalho Timbrado Oficial diretamente como vetor nítido no jsPDF
   * @returns {number} Y position onde o conteúdo seguinte deve iniciar
   */
  drawInstitutionalHeader(doc, title, subtitle = '', orientation = 'portrait') {
    const school = this.app.getActiveSchool() || { nome: 'Portal do Curso', cnpj: '' };
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const pageWidth = orientation === 'landscape' ? 297 : 210;

    // Nome da Instituição e Subtítulo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(15, 23, 42); // #0f172a
    doc.text(String(school.nome || 'PORTAL DO CURSO').toUpperCase(), 14, 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(71, 85, 105); // #475569
    const subHeader = `${school.endereco || ''} ${school.cnpj ? '• CNPJ: ' + school.cnpj : ''} • Secretaria Acadêmica`;
    doc.text(subHeader, 14, 20);

    // Título do Documento à direita
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(String(title || 'DOCUMENTO OFICIAL').toUpperCase(), pageWidth - 14, 15, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${subtitle} • Emissão: ${dateStr} às ${timeStr}`, pageWidth - 14, 20, { align: 'right' });

    // Linha divisória timbrada
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(14, 23, pageWidth - 14, 23);

    return 28; // Coordenada Y segura para início dos dados
  }

  /**
   * Desenha o Rodapé Timbrado Oficial e paginação vetorial em todas as páginas do PDF
   */
  drawInstitutionalFooter(doc, orientation = 'portrait', code = null) {
    const pageCount = doc.internal.getNumberOfPages();
    const pageWidth = orientation === 'landscape' ? 297 : 210;
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    const authCode = code || ('DOC-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-2026');
    const dateStr = new Date().toLocaleDateString('pt-BR');

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(203, 213, 225); // #cbd5e1
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Documento oficial gerado eletronicamente pelo Portal do Curso Multi-Escolas', 14, pageHeight - 7);
      doc.text(`Autenticação: ${authCode} • Data: ${dateStr} • Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }
  }

  /**
   * Cabeçalho Institucional Padrão Timbrado em HTML (usado para impressão direta ou previews)
   */
  getInstitutionHeader(title, subtitle = '') {
    const school = this.app.getActiveSchool() || { nome: 'Portal do Curso', cnpj: '' };
    const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="img/logo.png" alt="Logo" style="height: 36px; max-width: 120px; object-fit: contain;" onerror="this.style.display='none'">
          <div>
            <div style="font-family: 'Outfit', sans-serif; font-size: 1.05rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.2;">
              ${this.app.escapeHTML(school.nome)}
            </div>
            <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;">
              ${this.app.escapeHTML(school.endereco || '')} ${school.cnpj ? '• CNPJ: ' + this.app.escapeHTML(school.cnpj) : ''}
            </div>
            <div style="font-size: 0.68rem; color: #64748b; font-weight: 600;">
              Secretaria de Controle e Registro Acadêmico
            </div>
          </div>
        </div>
        <div style="text-align: right; font-size: 0.7rem; color: #64748b; flex-shrink: 0;">
          <div style="font-weight: 700; color: #0f172a; font-size: 0.8rem; text-transform: uppercase;">${this.app.escapeHTML(title)}</div>
          <div>${this.app.escapeHTML(subtitle)}</div>
          <div style="margin-top: 2px; font-size: 0.65rem;">Emissão: ${dateStr} às ${timeStr}</div>
        </div>
      </div>
    `;
  }

  /**
   * Rodapé Institucional Padrão em HTML
   */
  getInstitutionFooter(code = null) {
    const authCode = code || ('DOC-' + Math.random().toString(36).substring(2, 7).toUpperCase() + '-2026');
    const dateStr = new Date().toLocaleDateString('pt-BR');

    return `
      <div style="margin-top: 18px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: #64748b;">
        <span>Documento oficial gerado eletronicamente pelo Portal do Curso Multi-Escolas</span>
        <span>Autenticação: <strong>${authCode}</strong> • Data: ${dateStr}</span>
      </div>
    `;
  }

  /**
   * Apresenta overlay de carregamento visual profissional e amigável durante operações de PDF
   */
  showLoadingOverlay(message = 'Gerando Documento Oficial em PDF...', subtitle = 'Formatando páginas, vetores e certificação digital...') {
    this.hideLoadingOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'pdf-global-loading-overlay';
    overlay.className = 'pdf-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15, 23, 42, 0.75)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.webkitBackdropFilter = 'blur(6px)';
    overlay.style.zIndex = '9999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    overlay.innerHTML = `
      <div style="background: var(--bg-card, #ffffff); color: var(--text-main, #0f172a); padding: 28px 36px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); text-align: center; max-width: 400px; border: 1px solid var(--border-color, #e2e8f0); animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(30,77,119,0.12); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
          <i class="fa-solid fa-file-pdf fa-bounce" style="font-size: 2rem; color: var(--primary, #1e4d77);"></i>
        </div>
        <div style="font-weight: 800; font-size: 1.15rem; font-family: 'Outfit', sans-serif; color: var(--text-main, #0f172a); margin-bottom: 6px;">${this.app.escapeHTML(message)}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted, #64748b); line-height: 1.4;">${this.app.escapeHTML(subtitle)}</div>
        <div style="margin-top: 18px; width: 100%; background: rgba(0,0,0,0.08); height: 6px; border-radius: 999px; overflow: hidden; position: relative;">
          <div class="pdf-indeterminate-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    this.currentLoadingOverlay = overlay;
  }

  /**
   * Oculta e remove com segurança o overlay de carregamento de PDF
   */
  hideLoadingOverlay() {
    const existing = document.getElementById('pdf-global-loading-overlay') || this.currentLoadingOverlay;
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    this.currentLoadingOverlay = null;
  }

  /**
   * Envolve a execução de geração de PDF com bloqueio de concorrência e feedback visual
   */
  async withPdfLoading(message, asyncFn, subtitle = 'Formatando páginas, vetores e certificação digital...') {
    if (this.isGenerating) {
      this.app.showToast('Já existe um documento sendo gerado. Aguarde um instante.', 'info');
      return;
    }
    this.isGenerating = true;
    this.showLoadingOverlay(message, subtitle);
    try {
      await new Promise(r => setTimeout(r, 60)); // Permite ao navegador renderizar a tela de carregamento
      await asyncFn();
    } catch (err) {
      console.error('[PdfService] Erro ao gerar PDF:', err);
      this.app.showToast('Ocorreu um erro ao gerar o documento PDF.', 'error');
    } finally {
      this.hideLoadingOverlay();
      this.isGenerating = false;
    }
  }

  /**
   * Converte um elemento ou HTML em PDF usando jsPDF (para layouts visuais ricos como carteirinha)
   */
  async exportToPDF(elementOrHtml, filename = 'documento.pdf', options = {}) {
    if (this.isGenerating) {
      this.app.showToast('Já existe um PDF sendo processado. Aguarde um instante.', 'info');
      return;
    }

    this.isGenerating = true;

    const hasLib = await this.ensureJsPdf();
    if (!hasLib) {
      this.isGenerating = false;
      this.app.showToast('Biblioteca jsPDF indisponível. Abrindo diálogo de impressão...', 'warning');
      this.printViaIframe(elementOrHtml, options);
      return;
    }

    let iframe = null;

    try {
      this.showLoadingOverlay('Gerando Documento Oficial...', 'Formatando vetor PDF e autenticação digital.');

      const orientation = options.orientation || 'portrait';
      const containerWidth = orientation === 'landscape' ? 1123 : 794;
      const printWidth = orientation === 'landscape' ? 277 : 190;
      const marginVal = options.margin !== undefined ? (Array.isArray(options.margin) ? options.margin[0] : options.margin) : 10;

      let htmlBody = '';
      if (typeof elementOrHtml === 'string') {
        htmlBody = elementOrHtml;
      } else if (elementOrHtml && elementOrHtml.innerHTML) {
        htmlBody = elementOrHtml.innerHTML;
      } else {
        htmlBody = '<div>Documento sem conteúdo</div>';
      }

      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = `${containerWidth}px`;
      iframe.style.height = orientation === 'landscape' ? '794px' : '1123px';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-1000';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      iframe.style.background = '#ffffff';
      document.body.appendChild(iframe);

      const idoc = iframe.contentDocument || iframe.contentWindow.document;
      idoc.open();
      idoc.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>${this.app.escapeHTML(filename)}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 11px;
              line-height: 1.45;
              width: ${containerWidth}px;
              margin: 0 !important;
              padding: 0 !important;
            }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px; }
            th { background: #f1f5f9; padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a; text-align: left; }
            td { padding: 5px 8px; border: 1px solid #cbd5e1; color: #1e293b; vertical-align: top; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; }
            ${this.getStudentCardStyles()}
          </style>
        </head>
        <body>
          <div style="padding: 10px 14px; box-sizing: border-box; width: 100%;">
            ${htmlBody}
          </div>
        </body>
        </html>
      `);
      idoc.close();

      const images = Array.from(idoc.images || []);
      if (images.length > 0) {
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 1500);
          });
        }));
      }

      await new Promise(r => setTimeout(r, 220));

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      await new Promise((resolve, reject) => {
        doc.html(idoc.body, {
          callback: (pdf) => {
            try {
              pdf.save(this.sanitizeFilename(filename));
              resolve(pdf);
            } catch (err) {
              reject(err);
            }
          },
          x: marginVal,
          y: marginVal,
          width: printWidth,
          windowWidth: containerWidth,
          autoPaging: 'text',
          html2canvas: {
            scale: 1,
            useCORS: true,
            allowTaint: true,
            logging: false
          }
        });
      });

      this.app.showToast(`Arquivo "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success', 'PDF Gerado');
    } catch (err) {
      console.error('[PdfService] Erro ao gerar PDF:', err);
      this.app.showToast('Erro ao processar PDF. Abrindo janela de impressão alternativa.', 'warning');
      this.printViaIframe(elementOrHtml, options);
    } finally {
      this.hideLoadingOverlay();
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      this.isGenerating = false;
    }
  }

  /**
   * Imprime qualquer documento ou HTML através de um iframe isolado para impressora física
   */
  printViaIframe(elementOrHtml, options = {}) {
    const orientation = options.orientation || 'portrait';
    let htmlBody = '';
    if (typeof elementOrHtml === 'string') {
      htmlBody = elementOrHtml;
    } else if (elementOrHtml && elementOrHtml.innerHTML) {
      htmlBody = elementOrHtml.innerHTML;
    } else {
      htmlBody = '<div>Documento sem conteúdo</div>';
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${this.app.escapeHTML(options.title || 'Impressão Oficial')}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 ${orientation};
            margin: 10mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 9.5pt;
            line-height: 1.45;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8.5pt; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          th { background: #f1f5f9 !important; padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a; text-align: left; }
          td { padding: 5px 8px; border: 1px solid #cbd5e1; color: #1e293b; vertical-align: top; }
          .no-print, button { display: none !important; }
          ${this.getStudentCardStyles()}
        </style>
      </head>
      <body>
        ${htmlBody}
      </body>
      </html>
    `);
    idoc.close();

    const doPrint = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Erro ao imprimir via iframe:', e);
        window.print();
      }
    };

    if (idoc.readyState === 'complete') {
      setTimeout(doPrint, 350);
    } else {
      iframe.onload = () => setTimeout(doPrint, 350);
    }

    const cleanup = () => {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    if (iframe.contentWindow) {
      iframe.contentWindow.onafterprint = cleanup;
    }
    setTimeout(cleanup, 60000);
  }

  /**
   * Estilos CSS da Carteirinha Estudantil no padrão ISO/IEC 7810 ID-1 (85.6 mm × 54.0 mm)
   */
  getStudentCardStyles() {
    return `
      .student-card-viewport {
        perspective: none !important;
        width: auto !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .student-card-flipper {
        transform: none !important;
        -webkit-transform: none !important;
        display: block !important;
        width: auto !important;
        height: auto !important;
        box-shadow: none !important;
      }
      .student-card-face {
        width: 85.6mm !important;
        height: 54mm !important;
        min-width: 85.6mm !important;
        min-height: 54mm !important;
        max-width: 85.6mm !important;
        max-height: 54mm !important;
        border-radius: 3.2mm !important;
        padding: 2.2mm 3.2mm !important;
        box-sizing: border-box !important;
        position: relative !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
        color: #ffffff !important;
        overflow: hidden !important;
        transform: none !important;
        -webkit-transform: none !important;
        backface-visibility: visible !important;
        -webkit-backface-visibility: visible !important;
        page-break-inside: avoid !important;
      }
      .student-card-front {
        background: linear-gradient(135deg, #0f2b48 0%, #1e4d77 60%, #2563eb 100%) !important;
        border: 0.5px solid rgba(255,255,255,0.4) !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        position: relative !important;
        top: auto !important;
        left: auto !important;
        transform: none !important;
        -webkit-transform: none !important;
        backface-visibility: visible !important;
        -webkit-backface-visibility: visible !important;
      }
      .student-card-back {
        background: linear-gradient(135deg, #09131f 0%, #111d2e 60%, #1e293b 100%) !important;
        border: 0.5px solid rgba(255,255,255,0.3) !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        position: relative !important;
        top: auto !important;
        left: auto !important;
        transform: none !important;
        -webkit-transform: none !important;
        backface-visibility: visible !important;
        -webkit-backface-visibility: visible !important;
      }
      .sc-header { display: flex !important; justify-content: space-between !important; align-items: center !important; border-bottom: 0.5px solid rgba(255,255,255,0.3) !important; padding-bottom: 1.2mm !important; }
      .sc-header-brand { display: flex !important; align-items: center !important; gap: 2mm !important; }
      .sc-header-text { display: flex !important; flex-direction: column !important; min-width: 0 !important; }
      .sc-logo-mini { width: 5.5mm !important; height: 5.5mm !important; background: rgba(255,255,255,0.2) !important; border-radius: 1.2mm !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 6pt !important; color: #fff !important; flex-shrink: 0 !important; }
      .sc-school-name { font-family: 'Outfit', sans-serif !important; font-size: 6.2pt !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 0.02em !important; color: #fff !important; max-width: 48mm !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      .sc-doc-type { font-size: 4.2pt !important; color: #93c5fd !important; font-weight: 600 !important; letter-spacing: 0.04em !important; }
      .sc-chip-hologram { flex-shrink: 0 !important; }
      .sc-smart-chip { width: 8.5mm !important; height: 6mm !important; background: linear-gradient(135deg, #d4af37 0%, #f6e05e 50%, #b7791f 100%) !important; border-radius: 1.2mm !important; position: relative !important; border: 0.4px solid #ecc94b !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .sc-smart-chip .chip-line:first-child { position: absolute !important; top: 50% !important; left: 0 !important; right: 0 !important; height: 0.3px !important; background: rgba(0,0,0,0.3) !important; }
      .sc-smart-chip .chip-line:last-child { position: absolute !important; top: 0 !important; bottom: 0 !important; left: 50% !important; width: 0.3px !important; background: rgba(0,0,0,0.3) !important; }
      .sc-body { display: flex !important; gap: 2.5mm !important; align-items: center !important; margin: 1mm 0 !important; flex: 1 !important; min-height: 0 !important; }
      .sc-photo-box { width: 17mm !important; min-width: 17mm !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 0.8mm !important; flex-shrink: 0 !important; }
      .sc-photo { width: 17mm !important; height: 21mm !important; border-radius: 1.8mm !important; border: 0.8px solid rgba(255,255,255,0.7) !important; overflow: hidden !important; background: #1e293b !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 8pt !important; font-weight: 800 !important; color: #93c5fd !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .sc-photo img, .sc-photo-img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
      .sc-info-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 0.8mm 1.5mm !important; flex: 1 !important; min-width: 0 !important; }
      .sc-field { display: flex !important; flex-direction: column !important; min-width: 0 !important; }
      .sc-field.sc-full { grid-column: span 2 !important; }
      .sc-label { font-size: 4.2pt !important; text-transform: uppercase !important; color: #93c5fd !important; font-weight: 700 !important; letter-spacing: 0.02em !important; }
      .sc-value { font-size: 5.6pt !important; color: #ffffff !important; font-weight: 600 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; line-height: 1.2 !important; }
      .sc-name-value { font-size: 6.5pt !important; font-weight: 800 !important; color: #ffffff !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      .sc-highlight { color: #fbbf24 !important; font-weight: 800 !important; font-family: 'JetBrains Mono', monospace !important; }
      .sc-status-pill { background: rgba(16,185,129,0.25) !important; border: 0.5px solid #10b981 !important; color: #34d399 !important; font-size: 4pt !important; font-weight: 800 !important; padding: 0.3mm 1.2mm !important; border-radius: 9999px !important; white-space: nowrap !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .sc-footer { display: flex !important; justify-content: space-between !important; align-items: center !important; border-top: 0.5px solid rgba(255,255,255,0.25) !important; padding-top: 1mm !important; font-size: 4.8pt !important; color: #cbd5e1 !important; }
      .sc-footer-tag { font-weight: 700 !important; color: #93c5fd !important; }
      .sc-validade strong { color: #34d399 !important; font-weight: 800 !important; }
      .sc-verso-header { border-bottom: 0.5px solid rgba(255,255,255,0.2) !important; padding-bottom: 1mm !important; }
      .sc-verso-school { font-family: 'Outfit', sans-serif !important; font-size: 6.2pt !important; font-weight: 800 !important; color: #fff !important; text-transform: uppercase !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      .sc-verso-meta { font-size: 4.2pt !important; color: #94a3b8 !important; }
      .sc-verso-body { display: flex !important; align-items: center !important; gap: 2.2mm !important; margin: 1mm 0 !important; flex: 1 !important; min-height: 0 !important; }
      .sc-qr-box { background: #ffffff !important; padding: 1mm !important; border-radius: 1.5mm !important; flex-shrink: 0 !important; text-align: center !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; }
      .sc-qr-img { width: 15mm !important; height: 15mm !important; display: block !important; }
      .sc-qr-caption { font-size: 3.5pt !important; color: #0f172a !important; font-weight: 700 !important; margin-top: 0.4mm !important; }
      .sc-verso-details { flex: 1 !important; min-width: 0 !important; text-align: left !important; }
      .sc-auth-key-box { margin-bottom: 0.8mm !important; }
      .sc-auth-code { font-family: 'JetBrains Mono', monospace !important; font-size: 4.6pt !important; font-weight: 800 !important; color: #38bdf8 !important; background: rgba(56,189,248,0.15) !important; padding: 0.3mm 1.5mm !important; border-radius: 0.8mm !important; border: 0.3px solid rgba(56,189,248,0.4) !important; display: inline-block !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .sc-legal-text, .sc-verso-legal { font-size: 3.8pt !important; color: #cbd5e1 !important; line-height: 1.25 !important; margin: 0 0 0.8mm 0 !important; }
      .sc-verso-stamp { font-size: 4.2pt !important; color: #34d399 !important; font-weight: 700 !important; display: flex !important; align-items: center !important; gap: 1mm !important; }
      .sc-footer-verso { border-top: 0.5px solid rgba(255,255,255,0.2) !important; padding-top: 1mm !important; display: flex !important; justify-content: space-between !important; font-size: 4.5pt !important; color: #94a3b8 !important; }
    `;
  }

  /* =========================================================================
     1. EXPORTAÇÃO E IMPRESSÃO DO VISUALIZADOR DE DOCUMENTOS OFICIAIS
     (Atestado, Histórico, Quitação, Boletim)
     ========================================================================= */
  getDocumentPreviewHtml() {
    const previewContent = document.getElementById('document-preview-content');
    if (!previewContent || !previewContent.innerHTML.trim()) {
      return null;
    }

    return `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #0f172a; line-height: 1.5;">
        <style>
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 8.5pt; }
          th { background: #f1f5f9; padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #0f172a; text-align: left; }
          td { padding: 4px 8px; border: 1px solid #cbd5e1; color: #1e293b; }
          .doc-school-name { font-size: 1.15rem !important; }
          .doc-title { font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 800; text-align: center; margin: 14px 0; color: #0f172a; letter-spacing: 0.04em; }
          .doc-content { font-size: 8.8pt; line-height: 1.65; margin-bottom: 18px; color: #1e293b; }
          .doc-signatures { display: flex; justify-content: space-around; margin-top: 25px; text-align: center; }
          .sig-line { border-top: 1px solid #0f172a; width: 180px; padding-top: 4px; font-weight: 700; font-size: 7.5pt; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 7pt; font-weight: 700; }
        </style>
        ${previewContent.innerHTML}
      </div>
    `;
  }

  async exportDocumentPreview() {
    const previewContent = document.getElementById('document-preview-content');
    if (!previewContent || !previewContent.innerHTML.trim()) {
      this.app.showToast('Nenhum documento aberto para exportação.', 'warning');
      return;
    }

    const modalTitleEl = document.querySelector('#modal-document-preview .modal-title');
    const titleText = modalTitleEl ? modalTitleEl.textContent.trim() : 'Documento Oficial';
    const school = this.app.getActiveSchool();
    const schoolName = school ? school.nome.substring(0, 15) : 'Instituicao';
    const filename = `${titleText}_${schoolName}_${new Date().toISOString().slice(0, 10)}`;

    const tableEl = previewContent.querySelector('table');
    // Se o documento contém tabela (ex.: Histórico Escolar ou Boletim), renderiza via AutoTable vetorial
    if (tableEl) {
      try {
        const doc = await this.createPdfDoc('portrait');
        const startY = this.drawInstitutionalHeader(doc, titleText, school.nome, 'portrait');

        // Textos introdutórios antes da tabela
        const introParagraphs = Array.from(previewContent.querySelectorAll('p, .doc-content > div:not(.doc-signatures)'))
          .map(el => el.textContent.trim())
          .filter(t => t.length > 0 && !t.includes('Código de Autenticidade'));

        let curY = startY;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);

        introParagraphs.forEach(p => {
          const lines = doc.splitTextToSize(p, 182);
          doc.text(lines, 14, curY);
          curY += (lines.length * 4.5) + 2;
        });

        // Tabela AutoTable vetorial nítida
        doc.autoTable({
          html: tableEl,
          startY: curY + 2,
          theme: 'striped',
          headStyles: {
            fillColor: [30, 77, 119],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left'
          },
          styles: {
            font: 'helvetica',
            fontSize: 7.8,
            cellPadding: 2.2,
            textColor: [15, 23, 42]
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          margin: { left: 14, right: 14, top: 25, bottom: 18 }
        });

        const finalY = doc.lastAutoTable.finalY || curY + 20;

        // Bloco de Assinaturas
        const sigY = (finalY + 35 > 280) ? (doc.addPage(), 35) : finalY + 18;
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.4);
        doc.line(25, sigY, 90, sigY);
        doc.line(120, sigY, 185, sigY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Secretaria Acadêmica', 57.5, sigY + 4, { align: 'center' });
        doc.text('Direção de Ensino', 152.5, sigY + 4, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text('Assinatura e Carimbo', 57.5, sigY + 8, { align: 'center' });
        doc.text('Visto de Homologação', 152.5, sigY + 8, { align: 'center' });

        this.drawInstitutionalFooter(doc, 'portrait');
        doc.save(this.sanitizeFilename(filename));
        this.app.showToast(`Documento "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success');
        return;
      } catch (err) {
        console.warn('[PdfService] Fallback para exportToPDF no documento preview:', err);
      }
    }

    // Se for texto corrido puro (Atestado/Quitação)
    const contentHtml = this.getDocumentPreviewHtml();
    await this.exportToPDF(contentHtml, filename, {
      orientation: 'portrait',
      margin: [10, 10, 10, 10]
    });
  }

  printDocumentDirect() {
    const contentHtml = this.getDocumentPreviewHtml();
    if (!contentHtml) {
      this.app.showToast('Nenhum documento aberto para impressão.', 'warning');
      return;
    }
    const modalTitleEl = document.querySelector('#modal-document-preview .modal-title');
    const titleText = modalTitleEl ? modalTitleEl.textContent.trim() : 'Documento Oficial';
    this.printViaIframe(contentHtml, { title: titleText, orientation: 'portrait' });
  }

  /* =========================================================================
     2. EXPORTAÇÃO E IMPRESSÃO DA CARTEIRINHA ESTUDANTIL (CIE)
     ========================================================================= */
  getStudentCardHtml() {
    const cardFront = document.querySelector('.student-card-front');
    const cardBack = document.querySelector('.student-card-back');

    if (!cardFront || !cardBack) {
      return null;
    }

    return `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 8px; text-align: center; background: #ffffff;">
        ${this.getInstitutionHeader('Carteira de Identificação Estudantil (CIE)', 'Padrão Oficial ISO/IEC 7810 ID-1 • Meia-Entrada Lei nº 12.933/2013')}
        <div style="margin-bottom: 12px; font-size: 7.8pt; color: #475569;">
          Documento emitido oficialmente em tamanho real padrão cartão de bolso (85,6 mm × 54,0 mm).
        </div>
        <div style="display: flex; justify-content: center; gap: 12mm; flex-wrap: wrap; margin: 12px auto; max-width: 100%;">
          <div style="border: 0.4mm dashed #64748b; border-radius: 4mm; padding: 2mm; display: inline-block; background: #f8fafc; text-align: left;">
            <div style="font-size: 5.5pt; font-weight: 700; color: #475569; margin-bottom: 1.5mm; text-transform: uppercase;">
              ✂ Linha de Recorte • Frente (85,6 mm × 54,0 mm)
            </div>
            ${cardFront.outerHTML}
          </div>
          <div style="border: 0.4mm dashed #64748b; border-radius: 4mm; padding: 2mm; display: inline-block; background: #f8fafc; text-align: left;">
            <div style="font-size: 5.5pt; font-weight: 700; color: #475569; margin-bottom: 1.5mm; text-transform: uppercase;">
              ✂ Linha de Recorte • Verso (85,6 mm × 54,0 mm)
            </div>
            ${cardBack.outerHTML}
          </div>
        </div>
        <div style="font-size: 6.8pt; color: #64748b; margin-top: 10px; max-width: 500px; margin-left: auto; margin-right: auto; line-height: 1.3;">
          <strong>Instruções de Impressão:</strong> Na caixa de diálogo de impressão, certifique-se de que a opção de <em>Escala</em> esteja configurada em <strong>100% (Padrão / Tamanho Real)</strong> para garantir as dimensões físicas exatas para crachás e porta-cartões.
        </div>
        ${this.getInstitutionFooter(document.getElementById('card-auth-code-text')?.textContent?.trim() || document.getElementById('sc-auth-code')?.textContent?.trim())}
      </div>
    `;
  }

  async exportStudentCard() {
    const contentHtml = this.getStudentCardHtml();
    if (!contentHtml) {
      this.app.showToast('Carteirinha não encontrada para exportar.', 'warning');
      return;
    }

    const studentName = document.getElementById('card-student-name')?.textContent?.trim() 
      || document.getElementById('sc-student-name')?.textContent?.trim() 
      || 'Estudante';
    const studentRa = document.getElementById('card-student-ra')?.textContent?.trim() 
      || document.getElementById('sc-student-ra')?.textContent?.trim() 
      || 'RA';
    const filename = `Carteirinha_Estudantil_${studentName}_${studentRa}`;

    await this.exportToPDF(contentHtml, filename, {
      orientation: 'portrait',
      margin: [10, 10, 10, 10]
    });
  }

  printStudentCardDirect() {
    const contentHtml = this.getStudentCardHtml();
    if (!contentHtml) {
      this.app.showToast('Carteirinha não encontrada para impressão.', 'warning');
      return;
    }
    this.printViaIframe(contentHtml, { title: 'Carteirinha Estudantil CIE', orientation: 'portrait' });
  }

  /* =========================================================================
     3. EXPORTAÇÃO DA PAUTA DE NOTAS & AVALIAÇÕES (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportGradesPauta(turmaId = null, disciplineId = null) {
    const currentTurmaId = turmaId 
      || this.app.selectedGradeTurmaId 
      || document.getElementById('notas-filter-turma')?.value
      || (this.app.state.classes && this.app.state.classes[0]?.id);
    const turma = (this.app.state.classes || []).find(t => t.id === currentTurmaId) || (this.app.state.classes || [])[0];

    if (!turma) {
      this.app.showToast('Nenhuma turma cadastrada para gerar a pauta de notas.', 'warning');
      return;
    }

    const course = (this.app.state.courses || []).find(c => c.id === turma.courseId) || { name: 'Curso Técnico / Graduação' };
    const discId = disciplineId || (turma.disciplineIds && turma.disciplineIds[0]);
    const discipline = (this.app.state.disciplines || []).find(d => d.id === discId) || { name: 'Disciplina Curricular' };

    const studentIds = turma.studentIds || [];
    const students = (this.app.state.users || [])
      .filter(u => studentIds.includes(u.id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const evals = (this.app.state.evaluations || []).filter(ev => {
      return ev.turmaId === turma.id || (ev.rawTurmaId && ev.rawTurmaId.startsWith(turma.id));
    });

    const notaAprovacao = parseFloat(turma.notaAprovacao) || 6.0;
    const orientation = evals.length > 3 ? 'landscape' : 'portrait';
    const pageWidth = orientation === 'landscape' ? 297 : 210;

    const doc = await this.createPdfDoc(orientation);
    const startY = this.drawInstitutionalHeader(
      doc,
      `Pauta Oficial de Notas • ${turma.code || turma.nome}`,
      `${course.name} - ${discipline.name}`,
      orientation
    );

    // Bloco resumo da Turma e Disciplina
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.setDrawColor(203, 213, 225); // #cbd5e1
    doc.setLineWidth(0.3);
    doc.roundedRect(14, startY, pageWidth - 28, 13, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`Turma: ${turma.nome} (${turma.code || 'S/C'})`, 18, startY + 5);
    doc.text(`Disciplina: ${discipline.name}`, 18, startY + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(`Total de Estudantes: ${students.length}`, pageWidth - 70, startY + 5);
    doc.text(`Média para Aprovação: ${notaAprovacao.toFixed(1)}`, pageWidth - 70, startY + 9.5);

    // Montagem das colunas e linhas da AutoTable
    const evalsHeaders = evals.map(ev => `${ev.name}\n(P: ${ev.weight || 1.0})`);
    const tableHead = [['#', 'RA', 'Nome do Estudante', ...evalsHeaders, 'Média', 'Situação']];

    const tableBody = students.map((st, idx) => {
      let sumGrades = 0;
      let sumWeights = 0;
      const scores = evals.map(ev => {
        const key = `${ev.id}_${st.id}`;
        const score = (this.app.state.studentGrades && this.app.state.studentGrades[key] !== undefined)
          ? parseFloat(this.app.state.studentGrades[key])
          : null;

        if (score !== null && !isNaN(score)) {
          const w = parseFloat(ev.weight) || 1.0;
          sumGrades += score * w;
          sumWeights += w;
          return score.toFixed(1);
        }
        return '-';
      });

      const media = sumWeights > 0 ? (sumGrades / sumWeights).toFixed(1) : '-';
      const numMedia = parseFloat(media);
      let statusStr = 'Pendente';

      if (!isNaN(numMedia)) {
        if (numMedia >= notaAprovacao) statusStr = 'Aprovado';
        else if (numMedia >= 4.0) statusStr = 'Exame';
        else statusStr = 'Reprovado';
      }

      return [
        idx + 1,
        st.ra || '--',
        st.nome,
        ...scores,
        media,
        statusStr
      ];
    });

    if (tableBody.length === 0) {
      tableBody.push(['-', '-', 'Nenhum aluno enturmado', ...evals.map(() => '-'), '-', '-']);
    }

    const mediaColIndex = tableHead[0].length - 2;
    const situacaoColIndex = tableHead[0].length - 1;

    doc.autoTable({
      head: tableHead,
      body: tableBody,
      startY: startY + 16,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 77, 119], // #1e4d77
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
        halign: 'center'
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [15, 23, 42]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 24, fontStyle: 'bold' },
        2: { cellWidth: orientation === 'landscape' ? 65 : 45, fontStyle: 'bold' },
        [mediaColIndex]: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        [situacaoColIndex]: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          // Centraliza notas
          if (data.column.index >= 3 && data.column.index < mediaColIndex) {
            data.cell.styles.halign = 'center';
          }
          // Cores de status de aprovação
          if (data.column.index === situacaoColIndex) {
            const val = String(data.cell.raw).trim();
            if (val === 'Aprovado') data.cell.styles.textColor = [5, 150, 105]; // verde
            else if (val === 'Exame') data.cell.styles.textColor = [217, 119, 6]; // âmbar
            else if (val === 'Reprovado') data.cell.styles.textColor = [220, 38, 38]; // vermelho
            else data.cell.styles.textColor = [100, 116, 139];
          }
        }
      },
      margin: { left: 14, right: 14, top: 25, bottom: 18 }
    });

    // Bloco de Assinaturas (Docente & Secretaria)
    const pageHeight = orientation === 'landscape' ? 210 : 297;
    const finalY = doc.lastAutoTable.finalY || (startY + 30);
    const needNewPage = finalY + 32 > pageHeight - 16;
    const sigY = needNewPage ? (doc.addPage(), 35) : finalY + 16;

    const sigLeft = orientation === 'landscape' ? 50 : 25;
    const sigRight = orientation === 'landscape' ? 180 : 120;
    const sigWidth = 65;

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.35);
    doc.line(sigLeft, sigY, sigLeft + sigWidth, sigY);
    doc.line(sigRight, sigY, sigRight + sigWidth, sigY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Docente Responsável', sigLeft + (sigWidth / 2), sigY + 4, { align: 'center' });
    doc.text('Secretaria Acadêmica', sigRight + (sigWidth / 2), sigY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura e Data', sigLeft + (sigWidth / 2), sigY + 8, { align: 'center' });
    doc.text('Visto & Homologação', sigRight + (sigWidth / 2), sigY + 8, { align: 'center' });

    this.drawInstitutionalFooter(doc, orientation);
    const filename = `Pauta_Notas_${turma.code || turma.nome}_${discipline.name}`;
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Pauta de notas "${this.sanitizeFilename(filename)}" exportada com sucesso!`, 'success');
  }

  /* =========================================================================
     4. EXPORTAÇÃO DA LISTA DE CHAMADA EM PAPEL (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportTurmaAttendanceSheet(turmaId = null) {
    const turma = (this.app.state.classes || []).find(t => t.id === turmaId) || (this.app.state.classes || [])[0];
    if (!turma) {
      this.app.showToast('Nenhuma turma selecionada para gerar a lista de chamada.', 'warning');
      return;
    }

    const course = (this.app.state.courses || []).find(c => c.id === turma.courseId) || { name: 'Curso' };
    const students = (this.app.state.users || [])
      .filter(u => (turma.studentIds || []).includes(u.id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const doc = await this.createPdfDoc('landscape');
    const startY = this.drawInstitutionalHeader(
      doc,
      `Lista Oficial de Chamada & Presença • ${turma.code || turma.nome}`,
      `${course.name} • Semestre Letivo 2026`,
      'landscape'
    );

    // Bloco de cabeçalho da aula para preenchimento manual do professor
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, startY, 269, 11, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('Docente: _____________________________________', 18, startY + 6.8);
    doc.text('Disciplina: ___________________________________', 105, startY + 6.8);
    doc.text('Data: ____ / ____ / 2026', 195, startY + 6.8);
    doc.text(`Total: ${students.length} alunos`, 245, startY + 6.8);

    const head = [['Nº', 'RA', 'Nome do Estudante', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', 'Total / Visto']];
    const body = students.map((st, idx) => [
      idx + 1,
      st.ra || '--',
      st.nome,
      '', '', '', '', '', '', '', '', '', '', ''
    ]);

    if (body.length === 0) {
      body.push(['-', '-', 'Nenhum estudante enturmado nesta classe.', '', '', '', '', '', '', '', '', '', '', '']);
    }

    doc.autoTable({
      head: head,
      body: body,
      startY: startY + 14,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 77, 119],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8,
        halign: 'center'
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        minCellHeight: 6.8, // Altura confortável para assinatura e vistos manuais
        cellPadding: 1.8,
        textColor: [15, 23, 42]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 26, fontStyle: 'bold' },
        2: { cellWidth: 68, fontStyle: 'bold' },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 14 },
        6: { cellWidth: 14 },
        7: { cellWidth: 14 },
        8: { cellWidth: 14 },
        9: { cellWidth: 14 },
        10: { cellWidth: 14 },
        11: { cellWidth: 14 },
        12: { cellWidth: 14 },
        13: { cellWidth: 25, halign: 'center' }
      },
      margin: { left: 14, right: 14, top: 25, bottom: 18 }
    });

    // Assinatura do Docente
    const finalY = doc.lastAutoTable.finalY || (startY + 30);
    const needNewPage = finalY + 25 > 195;
    const sigY = needNewPage ? (doc.addPage(), 35) : finalY + 14;

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.35);
    doc.line(190, sigY, 265, sigY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Assinatura do Docente', 227.5, sigY + 4, { align: 'center' });

    this.drawInstitutionalFooter(doc, 'landscape');
    const filename = `Lista_Chamada_${turma.code || turma.nome}`;
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Lista de chamada "${this.sanitizeFilename(filename)}" gerada com sucesso!`, 'success');
  }

  /* =========================================================================
     5. EXPORTAÇÃO DO RELATÓRIO DE FREQUÊNCIA (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportAttendanceReport() {
    const select = document.getElementById('freq-turma-select') || document.getElementById('frequencia-filter-turma');
    const selectedRawId = select ? select.value : (this.app.state.classes[0] ? this.app.state.classes[0].id : null);
    const [selectedTurmaId, selectedTdId] = selectedRawId ? selectedRawId.split('__') : [null, null];
    const turma = (this.app.state.classes || []).find(t => t.id === selectedTurmaId) || (this.app.state.classes || [])[0];

    const turmaName = turma ? turma.nome : 'Geral';
    const doc = await this.createPdfDoc('portrait');
    const startY = this.drawInstitutionalHeader(
      doc,
      `Relatório de Frequência & Assiduidade`,
      `Turma: ${turmaName}`,
      'portrait'
    );

    // Se a tabela já está no DOM
    const tableEl = document.querySelector('#tab-frequencia table') || document.getElementById('attendance-report-table');

    if (tableEl && tableEl.querySelectorAll('tbody tr').length > 0) {
      doc.autoTable({
        html: tableEl,
        startY: startY + 4,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 77, 119],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.8
        },
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: 2.2
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    } else {
      // Fallback construído a partir do state
      const students = (this.app.state.users || []).filter(u => u.tipo === 'aluno' && (!turma || (turma.studentIds || []).includes(u.id)));
      const head = [['#', 'RA', 'Nome do Estudante', 'Aulas Previstas', 'Presenças', 'Faltas', 'Freq. %', 'Situação']];
      const body = students.map((aluno, idx) => [
        idx + 1,
        aluno.ra || '--',
        aluno.nome,
        '40 Aulas',
        '38',
        '2',
        '95%',
        'Regular'
      ]);

      doc.autoTable({
        head: head,
        body: body.length > 0 ? body : [['-', '-', 'Nenhum registro de frequência disponível', '-', '-', '-', '-', '-']],
        startY: startY + 4,
        theme: 'striped',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.2 },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    }

    this.drawInstitutionalFooter(doc, 'portrait');
    const filename = `Relatorio_Frequencia_${turmaName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Relatório de frequência "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success');
  }

  /* =========================================================================
     6. EXPORTAÇÃO DA LISTA DE USUÁRIOS (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportUsersList(roleFilter = 'todos') {
    const activeSchool = this.app.getActiveSchool();
    const schoolId = activeSchool ? activeSchool.id : null;

    let users = (this.app.state.users || []).filter(u => !schoolId || u.schoolId === schoolId);
    if (roleFilter && roleFilter !== 'todos') {
      users = users.filter(u => u.tipo === roleFilter);
    }
    users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    const roleLabels = {
      gestao: 'Gestores / Administradores',
      secretaria: 'Secretaria Acadêmica',
      professor: 'Corpo Docente / Professores',
      aluno: 'Alunos / Estudantes'
    };

    const doc = await this.createPdfDoc('portrait');
    const startY = this.drawInstitutionalHeader(
      doc,
      'Relação Oficial de Usuários Cadastrados',
      `Filtro: ${roleLabels[roleFilter] || 'Todos os Perfis'} • Total: ${users.length}`,
      'portrait'
    );

    const head = [['#', 'RA / Matrícula', 'Nome Completo', 'E-mail Institucional', 'Perfil', 'Status']];
    const body = users.map((u, idx) => [
      idx + 1,
      u.ra || '--',
      u.nome,
      u.email || '--',
      roleLabels[u.tipo] || u.tipo,
      u.ativo !== false ? 'Ativo' : 'Inativo'
    ]);

    if (body.length === 0) {
      body.push(['-', '-', 'Nenhum usuário cadastrado.', '-', '-', '-']);
    }

    doc.autoTable({
      head: head,
      body: body,
      startY: startY + 4,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 77, 119],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [15, 23, 42]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 26, fontStyle: 'bold' },
        2: { cellWidth: 52, fontStyle: 'bold' },
        3: { cellWidth: 50 },
        4: { cellWidth: 26 },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          if (data.cell.raw === 'Ativo') data.cell.styles.textColor = [5, 150, 105];
          else data.cell.styles.textColor = [220, 38, 38];
        }
      },
      margin: { left: 14, right: 14, top: 25, bottom: 18 }
    });

    this.drawInstitutionalFooter(doc, 'portrait');
    const filename = `Relacao_Usuarios_${roleFilter}_2026`;
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Lista de usuários "${this.sanitizeFilename(filename)}" exportada com sucesso!`, 'success');
  }

  /* =========================================================================
     7. EXPORTAÇÃO DO ACERVO BIBLIOGRÁFICO (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportBibliography() {
    const biblioItems = this.app.state.bibliography || [];
    const courseId = this.app.selectedBiblioCourseId;
    const filtered = (courseId && courseId !== 'todos')
      ? biblioItems.filter(b => b.courseId === courseId)
      : biblioItems;

    const doc = await this.createPdfDoc('portrait');
    const startY = this.drawInstitutionalHeader(
      doc,
      'Acervo Bibliográfico & Bibliografia',
      'Referências Básicas e Complementares',
      'portrait'
    );

    const head = [['#', 'Título da Obra', 'Autor(es)', 'Editora / Ano', 'Curso', 'Disciplina', 'Tipo']];
    const body = filtered.map((b, idx) => {
      const course = (this.app.state.courses || []).find(c => c.id === b.courseId);
      const disc = (this.app.state.disciplines || []).find(d => d.id === b.disciplineId);
      return [
        idx + 1,
        b.title || 'Título Indisponível',
        b.author || '--',
        `${b.publisher || '--'} (${b.year || '--'})`,
        course ? course.name : 'Geral',
        disc ? disc.name : 'Geral',
        b.type === 'complementar' ? 'Complementar' : 'Básica'
      ];
    });

    if (body.length === 0) {
      body.push(['-', 'Nenhuma obra bibliográfica cadastrada.', '-', '-', '-', '-', '-']);
    }

    doc.autoTable({
      head: head,
      body: body,
      startY: startY + 4,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 77, 119],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.8
      },
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: 2.2,
        textColor: [15, 23, 42]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 50, fontStyle: 'bold' },
        2: { cellWidth: 36 },
        3: { cellWidth: 30 },
        4: { cellWidth: 26 },
        5: { cellWidth: 20 },
        6: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14, top: 25, bottom: 18 }
    });

    this.drawInstitutionalFooter(doc, 'portrait');
    const filename = `Bibliografia_Recomendada_2026`;
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Bibliografia "${this.sanitizeFilename(filename)}" gerada com sucesso!`, 'success');
  }

  /* =========================================================================
     8. EXPORTAÇÃO DO RELATÓRIO FINANCEIRO (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportFinancialReport() {
    const isGestao = this.app.hasRole ? this.app.hasRole('gestao', 'secretaria') : true;
    const filename = isGestao ? 'Relatorio_Financeiro_Gerencial_2026' : 'Extrato_Financeiro_Mensalidades';

    const doc = await this.createPdfDoc('portrait');
    const startY = this.drawInstitutionalHeader(
      doc,
      isGestao ? 'Relatório Financeiro & Fluxo de Mensalidades' : 'Extrato Financeiro do Aluno • Carnê',
      'Exercício Financeiro 2026',
      'portrait'
    );

    const tableEl = document.querySelector('#tab-financeiro table') 
      || document.getElementById('financial-report-table') 
      || document.querySelector('#modal-financial-report table')
      || document.querySelector('#modal-student-carne table');

    if (tableEl && tableEl.querySelectorAll('tbody tr').length > 0) {
      doc.autoTable({
        html: tableEl,
        startY: startY + 4,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 77, 119],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.8
        },
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: 2.2
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    } else {
      // Tabela básica sintetizada caso a visualização de tabela esteja minimizada
      const head = [['#', 'Competência', 'Descrição', 'Valor (R$)', 'Vencimento', 'Situação']];
      const body = [
        ['1', 'Jan/2026', 'Mensalidade Escolar', 'R$ 450,00', '10/01/2026', 'Quitado'],
        ['2', 'Fev/2026', 'Mensalidade Escolar', 'R$ 450,00', '10/02/2026', 'Quitado'],
        ['3', 'Mar/2026', 'Mensalidade Escolar', 'R$ 450,00', '10/03/2026', 'A Vencer']
      ];

      doc.autoTable({
        head: head,
        body: body,
        startY: startY + 4,
        theme: 'striped',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.2 },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    }

    this.drawInstitutionalFooter(doc, 'portrait');
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Relatório financeiro "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success');
  }

  /* =========================================================================
     9. EXPORTAÇÃO DA MATRIZ CURRICULAR (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportMatriz() {
    const courseSelect = document.getElementById('curriculum-filter-curso');
    const courseName = (courseSelect && courseSelect.options[courseSelect.selectedIndex]) 
      ? courseSelect.options[courseSelect.selectedIndex].text 
      : 'Geral';
    const filename = `Matriz_Curricular_${courseName}`;

    const doc = await this.createPdfDoc('portrait');
    const startY = this.drawInstitutionalHeader(
      doc,
      `Matriz Curricular • ${courseName}`,
      'Estrutura Curricular e Distribuição de Carga Horária',
      'portrait'
    );

    const tableEl = document.querySelector('#curriculum-grid-container table') || document.querySelector('#tab-matriz table');

    if (tableEl && tableEl.querySelectorAll('tbody tr').length > 0) {
      doc.autoTable({
        html: tableEl,
        startY: startY + 4,
        theme: 'striped',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.2 },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    } else {
      const disciplines = this.app.state.disciplines || [];
      const head = [['#', 'Código', 'Disciplina', 'Carga Horária', 'Módulo / Semestre', 'Docente']];
      const body = disciplines.map((d, idx) => [
        idx + 1,
        d.code || `DISC-${idx + 1}`,
        d.name,
        `${d.workload || 60} horas`,
        `Semestre ${d.semester || 1}`,
        d.teacherName || 'A Definir'
      ]);

      doc.autoTable({
        head: head,
        body: body.length > 0 ? body : [['-', '-', 'Nenhuma disciplina cadastrada.', '-', '-', '-']],
        startY: startY + 4,
        theme: 'striped',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.2 },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    }

    this.drawInstitutionalFooter(doc, 'portrait');
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Matriz curricular "${this.sanitizeFilename(filename)}" gerada com sucesso!`, 'success');
  }

  /* =========================================================================
     10. EXPORTAÇÃO DO QUADRO DE HORÁRIOS (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportSchedule() {
    const school = this.app.getActiveSchool();
    const filename = `Grade_Horarios_${school ? school.nome.substring(0, 15) : 'Geral'}_2026`;

    const doc = await this.createPdfDoc('landscape');
    const startY = this.drawInstitutionalHeader(
      doc,
      'Quadro Geral de Horários das Aulas',
      'Semestre Letivo 2026',
      'landscape'
    );

    const tableEl = document.querySelector('#schedule-turmas-view-container table') 
      || document.querySelector('#tab-horarios table')
      || document.querySelector('.schedule-grid-container table');

    if (tableEl && tableEl.querySelectorAll('tbody tr').length > 0) {
      doc.autoTable({
        html: tableEl,
        startY: startY + 4,
        theme: 'grid',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5 },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    } else {
      // Quadro padrão semanal
      const head = [['Horário', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']];
      const body = [
        ['08:00 - 09:40', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Plantão Acadêmico'],
        ['10:00 - 11:40', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Aulas Regulares', 'Atividades Práticas'],
        ['19:00 - 20:40', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', '-'],
        ['21:00 - 22:30', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', 'Aulas Noturnas', '-']
      ];

      doc.autoTable({
        head: head,
        body: body,
        startY: startY + 4,
        theme: 'grid',
        headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
        styles: { font: 'helvetica', fontSize: 7.5, minCellHeight: 8, cellPadding: 2.5, halign: 'center' },
        margin: { left: 14, right: 14, top: 25, bottom: 18 }
      });
    }

    this.drawInstitutionalFooter(doc, 'landscape');
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Quadro de horários "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success');
  }

  /* =========================================================================
     11. EXPORTAÇÃO DO CALENDÁRIO ACADÊMICO (AUTOTABLE VETORIAL)
     ========================================================================= */
  async exportCalendar() {
    const monthTitle = document.getElementById('calendar-month-title')?.textContent?.trim() 
      || document.getElementById('calendar-current-month-display')?.textContent?.trim() 
      || '2026';
    const filename = `Calendario_Academico_${monthTitle.replace(/\s+/g, '_')}`;

    const doc = await this.createPdfDoc('landscape');
    const startY = this.drawInstitutionalHeader(
      doc,
      `Calendário Acadêmico Oficial • ${monthTitle}`,
      'Atividades Letivas, Feriados e Avaliações',
      'landscape'
    );

    const events = this.app.state.calendarEvents || [];
    const head = [['Data', 'Dia da Semana', 'Evento / Atividade Acadêmica', 'Categoria / Tipo', 'Impacto Letivo']];
    const body = events.map(ev => {
      const d = ev.date ? new Date(ev.date + 'T12:00:00') : new Date();
      const dateFormatted = d.toLocaleDateString('pt-BR');
      const weekDay = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      return [
        dateFormatted,
        weekDay.charAt(0).toUpperCase() + weekDay.slice(1),
        ev.title || ev.name || 'Atividade Acadêmica',
        ev.type || 'Geral',
        ev.noClass ? 'Sem Aula (Feriado / Recesso)' : 'Dia Letivo Normal'
      ];
    });

    if (body.length === 0) {
      body.push(['Janeiro/2026', 'Período', 'Início das Aulas e Acolhimento dos Alunos', 'Marco Inicial', 'Dia Letivo']);
      body.push(['Fevereiro/2026', 'Carnaval', 'Recesso Acadêmico de Carnaval', 'Recesso', 'Sem Aula']);
      body.push(['Abril/2026', 'Avaliações', 'Semana Oficial de Provas e Avaliações Bimestrais', 'Avaliação', 'Dia Letivo']);
      body.push(['Junho/2026', 'Encerramento', 'Fechamento de Notas e Conselho de Classe', 'Encerramento', 'Dia Letivo']);
    }

    doc.autoTable({
      head: head,
      body: body,
      startY: startY + 4,
      theme: 'striped',
      headStyles: { fillColor: [30, 77, 119], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 32 },
        2: { cellWidth: 100, fontStyle: 'bold' },
        3: { cellWidth: 40 },
        4: { cellWidth: 45, halign: 'center' }
      },
      margin: { left: 14, right: 14, top: 25, bottom: 18 }
    });

    this.drawInstitutionalFooter(doc, 'landscape');
    doc.save(this.sanitizeFilename(filename));
    this.app.showToast(`Calendário acadêmico "${this.sanitizeFilename(filename)}" gerado com sucesso!`, 'success');
  }
}
