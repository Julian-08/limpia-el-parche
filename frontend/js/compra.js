// =====================================================================
//  LIMPIA EL PARCHE - Simulación de compra para empresas
//  Todo ocurre en el navegador: no se envía ni se guarda ningún dato.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);

  // Precios mensuales en COP, antes de IVA
  const PLANES = [
    { id: 'basico', nombre: 'Básico', precio: 350000,
      beneficios: ['Panel con mapa de calor', 'Reportes por localidad', 'Soporte por correo'] },
    { id: 'empresarial', nombre: 'Empresarial', precio: 890000, destacado: true,
      beneficios: ['Todo lo del plan Básico', 'Moderación de reportes', 'Cortes del mapa y estadísticas', '5 usuarios administradores'] },
    { id: 'corporativo', nombre: 'Corporativo', precio: 1900000,
      beneficios: ['Todo lo del plan Empresarial', 'Usuarios ilimitados', 'Soporte telefónico prioritario', 'Acompañamiento en la implementación'] }
  ];
  const IVA = 0.19;

  const pedido = { plan: null, empresa: null, pago: null };
  const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  let temporizadorToast;
  function toast(mensaje, tipo = '', duracion = 4000) {
    const t = $('toast');
    t.textContent = mensaje;
    t.className = `toast visible ${tipo}`;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.className = 'toast'; }, duracion);
  }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------------------------------------------------------------
  //  Navegación entre pasos
  // ---------------------------------------------------------------
  function irAPaso(n) {
    [1, 2, 3, 4].forEach(i => { $(`paso-${i}`).hidden = i !== n; });
    document.querySelectorAll('#pasos-compra li').forEach(li => {
      const p = Number(li.dataset.paso);
      li.classList.toggle('activo', p === n);
      li.classList.toggle('hecho', p < n);
    });
    document.querySelector('.compra').scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('[data-volver]').forEach(b => b.addEventListener('click', () => irAPaso(Number(b.dataset.volver))));

  // ---------------------------------------------------------------
  //  Errores de campos (mismo patrón que el formulario de reporte)
  // ---------------------------------------------------------------
  function mostrarError(clave, mensaje) {
    $(`err-${clave}`).textContent = mensaje;
    const campo = $(`campo-${clave}`);
    if (campo) campo.classList.add('invalido');
  }
  function limpiarErrores(form) {
    form.querySelectorAll('.error').forEach(s => { s.textContent = ''; });
    form.querySelectorAll('.campo.invalido').forEach(c => c.classList.remove('invalido'));
  }
  function aplicarErrores(form, errores) {
    limpiarErrores(form);
    Object.entries(errores).forEach(([k, v]) => mostrarError(k, v));
    const primero = form.querySelector('.campo.invalido input, .campo.invalido select');
    if (primero) primero.focus();
    return Object.keys(errores).length === 0;
  }

  // ---------------------------------------------------------------
  //  Paso 1: planes
  // ---------------------------------------------------------------
  $('planes').innerHTML = PLANES.map(p => `
    <label class="plan ${p.destacado ? 'destacado' : ''}">
      <input type="radio" name="plan" value="${p.id}">
      ${p.destacado ? '<span class="etiqueta-plan">Más elegido</span>' : ''}
      <strong>${p.nombre}</strong>
      <span class="precio">${pesos.format(p.precio)}<small> / mes + IVA</small></span>
      <ul>${p.beneficios.map(b => `<li>${b}</li>`).join('')}</ul>
    </label>`).join('');

  $('planes').addEventListener('change', (e) => {
    pedido.plan = PLANES.find(p => p.id === e.target.value);
    $('err-plan').textContent = '';
    pintarResumen();
  });

  $('btn-paso-1').addEventListener('click', () => {
    if (!pedido.plan) { $('err-plan').textContent = 'Elige un plan para continuar.'; return; }
    irAPaso(2);
  });

  function pintarResumen() {
    const p = pedido.plan;
    if (!p) return;
    const iva = Math.round(p.precio * IVA);
    $('resumen-pedido').innerHTML = `
      <div class="linea"><span>Plan ${p.nombre} (1 mes)</span><span>${pesos.format(p.precio)}</span></div>
      <div class="linea"><span>IVA (19 %)</span><span>${pesos.format(iva)}</span></div>
      <div class="linea total"><span>Total</span><span>${pesos.format(p.precio + iva)}</span></div>
      ${pedido.empresa ? `<p class="para-empresa">Para: <strong>${escapar(pedido.empresa.razon)}</strong><br>NIT ${pedido.empresa.nit}-${pedido.empresa.dv}</p>` : ''}`;
  }

  // ---------------------------------------------------------------
  //  Paso 2: datos de la empresa (solo personas jurídicas)
  // ---------------------------------------------------------------
  // Dígito de verificación del NIT según el algoritmo de la DIAN
  function digitoVerificacion(nit) {
    const pesosDian = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let suma = 0;
    [...nit].reverse().forEach((d, i) => { suma += Number(d) * pesosDian[i]; });
    const residuo = suma % 11;
    return residuo > 1 ? 11 - residuo : residuo;
  }

  const soloNumeros = (id) => $(id).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  ['nit', 'dv', 'rep-doc', 'telefono', 'cvv'].forEach(soloNumeros);

  $('form-empresa').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    const errores = {};

    if (v('razon').length < 3) errores.razon = 'Escribe la razón social de la empresa.';
    if (!v('tipo-sociedad')) errores['tipo-sociedad'] = 'Selecciona el tipo de sociedad.';

    const nit = v('nit'), dv = v('dv');
    if (!/^\d{9,10}$/.test(nit)) errores.nit = 'El NIT debe tener 9 o 10 dígitos, sin puntos ni guion.';
    else if (!/^[89]/.test(nit)) errores.nit = 'Este NIT no corresponde a una persona jurídica (los NIT de empresas inician en 8 o 9).';
    else if (!/^\d$/.test(dv)) errores.nit = 'Escribe el dígito de verificación (DV).';
    else if (digitoVerificacion(nit) !== Number(dv)) errores.nit = 'El dígito de verificación no coincide con el NIT. Revisa el RUT de la empresa.';

    if (v('rep-nombre').split(/\s+/).length < 2) errores['rep-nombre'] = 'Escribe nombre y apellido del representante legal.';
    if (!/^\d{6,15}$/.test(v('rep-doc'))) errores['rep-doc'] = 'Escribe un número de documento válido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('correo'))) errores.correo = 'Escribe un correo electrónico válido.';
    if (!/^(3\d{9}|60\d{8})$/.test(v('telefono'))) errores.telefono = 'Escribe un celular (3XX) o fijo (60X) de 10 dígitos.';
    if (v('direccion').length < 5) errores.direccion = 'Escribe la dirección de la empresa.';
    if (v('ciudad').length < 3) errores.ciudad = 'Escribe la ciudad.';
    if (!$('juridica').checked) errores.juridica = 'Esta compra es exclusiva para personas jurídicas.';
    if (!$('politica').checked) errores.politica = 'Debes aceptar la política de tratamiento de datos.';

    if (!aplicarErrores(e.target, errores)) return;
    pedido.empresa = {
      razon: v('razon'), tipo: v('tipo-sociedad'), nit, dv,
      representante: v('rep-nombre'), documento: `${v('rep-tipo-doc')} ${v('rep-doc')}`,
      correo: v('correo'), telefono: v('telefono'), direccion: `${v('direccion')}, ${v('ciudad')}`
    };
    pintarResumen();
    irAPaso(3);
  });

  // ---------------------------------------------------------------
  //  Paso 3: pago (solo Visa y Mastercard)
  // ---------------------------------------------------------------
  function marcaTarjeta(numero) {
    if (/^4/.test(numero)) return 'visa';
    if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(numero)) return 'mastercard';
    if (/^3[47]/.test(numero)) return 'American Express';
    if (/^3(0[0-5]|[68])/.test(numero)) return 'Diners Club';
    if (/^6/.test(numero)) return 'otra';
    return null;
  }

  // Algoritmo de Luhn: detecta números de tarjeta mal digitados
  function luhnValido(numero) {
    let suma = 0;
    [...numero].reverse().forEach((d, i) => {
      let n = Number(d);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      suma += n;
    });
    return suma % 10 === 0;
  }

  $('tarjeta').addEventListener('input', (e) => {
    const numero = e.target.value.replace(/\D/g, '').slice(0, 19);
    e.target.value = numero.replace(/(\d{4})(?=\d)/g, '$1 ');
    const marca = marcaTarjeta(numero);
    const etiqueta = $('marca');
    etiqueta.className = 'marca';
    etiqueta.textContent = '';
    if (marca === 'visa') { etiqueta.textContent = 'VISA'; etiqueta.classList.add('visa'); }
    else if (marca === 'mastercard') { etiqueta.textContent = 'Mastercard'; etiqueta.classList.add('mastercard'); }
    else if (marca) { etiqueta.textContent = 'No aceptada'; etiqueta.classList.add('rechazada'); }
  });

  $('vence').addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });

  $('form-pago').addEventListener('submit', (e) => {
    e.preventDefault();
    const numero = $('tarjeta').value.replace(/\D/g, '');
    const marca = marcaTarjeta(numero);
    const errores = {};

    if (!numero) errores.tarjeta = 'Escribe el número de la tarjeta.';
    else if (marca !== 'visa' && marca !== 'mastercard') {
      errores.tarjeta = marca && marca !== 'otra'
        ? `No aceptamos ${marca}. Usa una tarjeta Visa o Mastercard.`
        : 'Solo aceptamos tarjetas Visa o Mastercard.';
    }
    else if ((marca === 'visa' && ![13, 16, 19].includes(numero.length)) || (marca === 'mastercard' && numero.length !== 16)) {
      errores.tarjeta = `El número de una tarjeta ${marca === 'visa' ? 'Visa' : 'Mastercard'} está incompleto.`;
    }
    else if (!luhnValido(numero)) errores.tarjeta = 'El número de tarjeta no es válido. Revisa que esté bien escrito.';

    if (!/^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,}$/.test($('titular').value.trim())) errores.titular = 'Escribe el nombre tal como aparece en la tarjeta.';

    const [mm, aa] = $('vence').value.split('/').map(Number);
    if (!mm || !aa || mm < 1 || mm > 12) errores.vence = 'Escribe la fecha como MM/AA.';
    else {
      const hoy = new Date();
      const finDeMes = new Date(2000 + aa, mm, 0, 23, 59, 59);
      if (finDeMes < hoy) errores.vence = 'La tarjeta está vencida.';
    }
    if (!/^\d{3}$/.test($('cvv').value)) errores.cvv = 'El CVV tiene 3 dígitos (reverso de la tarjeta).';

    if (!aplicarErrores(e.target, errores)) return;

    pedido.pago = { marca: marca === 'visa' ? 'Visa' : 'Mastercard', ultimos: numero.slice(-4), cuotas: $('cuotas').value };
    // No se conserva el número completo ni el CVV
    e.target.reset();
    $('marca').className = 'marca';
    $('marca').textContent = '';

    const btn = $('btn-pagar');
    btn.disabled = true;
    btn.textContent = 'Procesando pago…';
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Pagar';
      mostrarComprobante();
      irAPaso(4);
      toast('Pago simulado aprobado.', 'exito');
    }, 1800);
  });

  // ---------------------------------------------------------------
  //  Paso 4: comprobante
  // ---------------------------------------------------------------
  function mostrarComprobante() {
    const { plan, empresa, pago } = pedido;
    const iva = Math.round(plan.precio * IVA);
    const ahora = new Date();
    const fecha = ahora.toISOString().slice(0, 10).replace(/-/g, '');
    const orden = `LEP-OC-${fecha}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const filas = [
      ['Orden', orden],
      ['Fecha', ahora.toLocaleString('es-CO')],
      ['Empresa', `${empresa.razon} (${empresa.tipo})`],
      ['NIT', `${empresa.nit}-${empresa.dv}`],
      ['Representante', `${empresa.representante} · ${empresa.documento}`],
      ['Correo', empresa.correo],
      ['Dirección', empresa.direccion],
      ['Plan', `${plan.nombre} (1 mes)`],
      ['Subtotal', pesos.format(plan.precio)],
      ['IVA (19 %)', pesos.format(iva)],
      ['Total', pesos.format(plan.precio + iva)],
      ['Tarjeta', `${pago.marca} •••• ${pago.ultimos} · ${pago.cuotas} ${pago.cuotas === '1' ? 'cuota' : 'cuotas'}`]
    ];
    $('comprobante').innerHTML = filas.map(([k, v]) => `<dt>${k}</dt><dd>${escapar(v)}</dd>`).join('');
  }
  $('btn-imprimir').addEventListener('click', () => window.print());

  // Menú en móvil
  $('nav-toggle').addEventListener('click', () => {
    const abierto = $('nav').classList.toggle('abierto');
    $('nav-toggle').setAttribute('aria-expanded', String(abierto));
  });
})();
