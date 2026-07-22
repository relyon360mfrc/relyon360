# Design System "Liquid Glass" — RelyOn 360

> Extraído do código real do RelyOn 360 (`js/auth.js`, `js/app.js`, `js/reports.js`, `js/dashboard.js`) em 2026-07-21, para reaproveitar em outro projeto. Não existia um documento próprio disso antes — este arquivo é a fonte a partir de agora. Não depende de nenhuma lib além de CSS puro (React inline styles no original, mas os valores valem para qualquer stack).

Estilo: inspirado no "Liquid Glass" da Apple (WWDC 2025/iOS 26) — vidro fosco translúcido em camadas, profundidade real via `backdrop-filter`, sem bordas duras, tudo com "specular highlight" (reflexo de luz vindo de cima).

---

## 1. Fonte

```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
```

- Sem fontes externas — aproveita a fonte nativa do sistema (SF Pro no Apple, Segoe/Roboto em outros).
- Pesos usados: 400 (regular), 600 (semibold/labels), 700–800 (títulos/logo).
- Letter-spacing: levemente positivo em labels pequenas (`0.3`–`0.5px`), levemente negativo em headings grandes.

---

## 2. Paleta base (tema escuro é o principal; claro é alternativa)

Cor de marca (laranja âmbar): `#ffa619` (destaque/CTA) com variante mais escura `#e8920a` para gradientes.

### Tokens de tema (setados via CSS custom properties em runtime, trocam com dark/light)

```js
// dark
'--rl-page-bg':        '#050505',
'--rl-heading-color':  '#ffffff',
'--rl-surface':        '#1c1c1e',
'--rl-surface-2':      '#2c2c2e',
'--rl-border':         'rgba(255,255,255,0.08)',
'--rl-text':           '#ffffff',
'--rl-text-2':         'rgba(235,235,245,0.60)',
'--rl-text-3':         'rgba(235,235,245,0.30)',
'--rl-input-bg':       '#1c1c1e',
'--rl-input-border':   'rgba(255,255,255,0.12)',
'--rl-input-text':     '#e2e8f0',
'--rl-label':          '#94a3b8',
'--rl-scrollbar-track':'#111111',
'--rl-scrollbar-thumb':'#2c2c2e',

// light
'--rl-page-bg':        '#f2f2f7',
'--rl-heading-color':  '#1d1d1f',
'--rl-surface':        '#ffffff',
'--rl-surface-2':      '#f5f5f7',
'--rl-border':         'rgba(60,60,67,0.12)',
'--rl-text':           '#1d1d1f',
'--rl-text-2':         'rgba(60,60,67,0.60)',
'--rl-text-3':         'rgba(60,60,67,0.30)',
'--rl-input-bg':       '#ffffff',
'--rl-input-border':   'rgba(60,60,67,0.18)',
'--rl-input-text':     '#1d1d1f',
'--rl-label':          '#636366',
'--rl-scrollbar-track':'#e5e5ea',
'--rl-scrollbar-thumb':'#c7c7cc',
```

Aplicar como no original: `document.body.setAttribute('data-rl-theme', theme)` + `root.style.setProperty(...)` em um `useEffect`, e usar `var(--rl-x, fallback)` em todo o CSS. Isso permite trocar dark/light sem re-renderizar componentes.

### Base do fundo (login/dashboard escuro)
`#011c22` (teal bem escuro) é o fundo de boot/login — não preto puro, evita "flash preto" no reload.

---

## 3. A receita do vidro (glassmorphism)

Três variações usadas, do mais sutil ao mais forte. A fórmula geral:

```css
background: rgba(<cor-base>, <opacidade 0.55–0.75>);
backdrop-filter: blur(<20–48px>) saturate(<160–240%>) brightness(<1.04–1.08>);
-webkit-backdrop-filter: <mesmo valor>; /* obrigatório p/ Safari/iOS */
border: 1px solid rgba(255,255,255,0.08–0.18);
border-radius: 10–24px;
box-shadow: 0 Xpx Ypx rgba(0,0,0,0.3–0.65),
            inset 1px 0 0 rgba(255,255,255,0.10–0.16),
            inset 0 1px 0 rgba(255,255,255,0.10–0.16);
```

Os `inset` no box-shadow são o segredo do "vidro" — simulam luz refletindo nas bordas internas (topo mais claro, lado esquerdo mais claro), como se houvesse espessura real no material.

### Card de login (referência principal — `auth.js`)
```css
background: rgba(5,45,56,0.75);
backdrop-filter: blur(28px) saturate(220%) brightness(1.06);
border: 1px solid rgba(255,166,25,0.18);  /* usa a cor de marca na borda */
border-radius: 24px;
box-shadow: 0 32px 80px rgba(0,0,0,0.65),
            0 0 0 1px rgba(255,166,25,0.06),
            inset 1px 0 0 rgba(255,255,255,0.12),
            inset 0 1px 0 rgba(255,255,255,0.16);
```
+ um `div` decorativo absoluto no topo simulando "specular highlight":
```css
background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 100%);
height: 120px; position: absolute; top:0; left:0; right:0; pointer-events:none;
```
+ anéis/arcos SVG decorativos no fundo, cor de marca, opacidade 0.03–0.11, `pointer-events:none` — dão profundidade sem competir com o conteúdo.

### Sidebar (tema `classic`, escuro — `app.js`)
```css
background: linear-gradient(160deg, rgba(0,15,24,0.72) 0%, rgba(1,50,61,0.58) 100%);
backdrop-filter: blur(48px) saturate(240%) brightness(1.08);
border-right: 1px solid rgba(255,255,255,0.06);       /* 0.12 quando expandida */
box-shadow: inset 1px 0 0 rgba(255,255,255,0.16),
            inset 0 1px 0 rgba(255,255,255,0.10),
            1px 0 0 rgba(255,255,255,0.04);
/* hover/aberta: */
box-shadow: inset 1px 0 0 rgba(255,255,255,0.20),
            inset 0 1px 0 rgba(255,255,255,0.12),
            16px 0 60px rgba(0,0,0,0.55),
            1px 0 0 rgba(255,255,255,0.08);
```
Item ativo do menu: `background: rgba(255,149,0,0.18); border-radius: 14px; color:#fff; ícone:#ff9500`.
Item hover (classe utilitária global, não inline):
```css
.rl-nav-btn:hover:not([data-active="true"]) { background: rgba(255,255,255,0.07); color:#fff; }
[data-rl-theme="light"] .rl-nav-btn:hover:not([data-active="true"]) { background: rgba(0,0,0,0.06); color:#1d1d1f; }
.rl-nav-btn:focus-visible { outline: 1px solid rgba(255,149,0,0.40); outline-offset: -1px; }
```

### Sidebar (tema `light`)
```css
background: rgba(242,242,247,0.72);
backdrop-filter: blur(48px) saturate(220%) brightness(1.04);
border-right: 1px solid rgba(60,60,67,0.12);
box-shadow: inset 1px 0 0 rgba(255,255,255,0.50), inset 0 1px 0 rgba(255,255,255,0.60);
```

### Painel/tooltip flutuante menor (`reports.js`)
```css
background: rgba(1,50,61,0.72);
backdrop-filter: blur(20px) saturate(160–200%);
border-radius: 10px;
border: 1px solid rgba(255,255,255,0.10);
box-shadow: 0 4px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06–0.14);
```

### Overlay de modal
```css
background: rgba(0,0,0,0.60–0.75);
backdrop-filter: blur(8–20px);
-webkit-backdrop-filter: blur(8–20px);
```

---

## 4. Cantos e espaçamento

- Cards/modais: `border-radius: 20–24px`
- Painéis médios (tooltips, banners): `10–12px`
- Itens de menu/pílulas: `12–16px`
- Botões "pill" (badges, toggles): `999px`
- Toggle switch: trilho `24px` altura / `12px` radius; knob `18px` círculo.

---

## 5. Transições

```css
transition: all 0.2–0.3s cubic-bezier(0.4, 0, 0.2, 1); /* easing padrão iOS/Material */
```
Hover de nav: `transition: background 0.18s ease, color 0.18s ease;`

---

## 6. Boot screen (tela de carregamento)

Anel SVG com gradiente girando + pulsando, sobre fundo `#011c22`:
```css
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes rl-boot-pulse { 0%,100% { stroke-dashoffset: 60; } 50% { stroke-dashoffset: 180; } }
.rl-boot-ring .rl-boot-arc {
  stroke: url(#gradient); /* linear-gradient de #ffd066 a #e8920a */
  animation: spin 1.4s linear infinite, rl-boot-pulse 2.2s ease-in-out infinite;
}
```
Título com destaque de cor no meio da palavra (ex.: "Rely**O**n") usando um `<span>` na cor de marca — recurso de identidade visual simples e replicável em qualquer nome de produto.

---

## 7. Botões primários

```css
background: linear-gradient(135deg, #ffa619, #e8920a);
border-radius: 12px;
box-shadow: 0 4px 20px rgba(255,166,25,0.3);
color: #fff; font-weight: 700;
/* disabled: background: #0e3a45; */
```

---

## 8. Como aplicar em outro projeto

1. Copiar a seção 2 (tokens `--rl-*`, renomeando o prefixo) como CSS custom properties globais + toggle dark/light.
2. Criar 2–3 "receitas de vidro" (seção 3) como classes utilitárias (`.glass-card`, `.glass-sidebar`, `.glass-panel`) em vez de inline — no R360 é inline porque o app inteiro é sem build tooling de CSS, mas isso não é necessário no projeto novo.
3. Sempre duplicar `backdrop-filter` com `-webkit-backdrop-filter` (Safari/iOS não aceita sem prefixo).
4. `backdrop-filter` some se o elemento pai tiver `overflow:hidden` + `transform` conflitante em alguns Safaris — testar cedo no iPad/iPhone real, não só desktop.
5. Especular highlight (gradiente branco 8%→0% no topo) e sombras `inset` são o que faz parecer "vidro" e não só "fundo transparente com blur" — não pular essa parte.
