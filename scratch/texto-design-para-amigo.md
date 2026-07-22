Quero que meu app tenha o mesmo estilo visual "Liquid Glass" (vidro fosco translúcido, tipo iOS 26/WWDC 2025). Aplica essas regras de design:

FONTE
-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif
(sem fonte externa, aproveita a fonte nativa do sistema). Pesos 400/600/700-800.

PALETA
Fundo escuro principal: #050505 (ou #011c22 em telas de login/boot — teal bem escuro, nunca preto puro pra não dar "flash preto" no carregamento)
Superfícies: #1c1c1e (cards) / #2c2c2e (elementos internos)
Texto: #ffffff (principal), rgba(235,235,245,0.60) (secundário), rgba(235,235,245,0.30) (terciário)
Cor de destaque/marca: um âmbar/laranja tipo #ffa619, com gradiente pra CTA: linear-gradient(135deg, #ffa619, #e8920a)
Versão clara (tema light): fundo #f2f2f7, superfícies brancas, texto #1d1d1f — mesma estrutura, invertida.

A RECEITA DO VIDRO (o efeito principal, aplica em cards, sidebar, modais, tooltips)
background: rgba(<cor-base>, 0.55 a 0.75) — nunca opaco
backdrop-filter: blur(20px a 48px) saturate(160% a 240%) brightness(1.04 a 1.08)
-webkit-backdrop-filter: (duplicar sempre, senão não funciona no Safari/iOS)
border: 1px solid rgba(255,255,255,0.08 a 0.18)
border-radius: generoso — 20-24px em cards, 10-12px em painéis menores, 999px em pills/toggles
box-shadow: sombra externa forte (0 32px 80px rgba(0,0,0,0.65) tipo) + duas sombras INSET:
  inset 1px 0 0 rgba(255,255,255,0.10-0.16) (brilho na borda esquerda)
  inset 0 1px 0 rgba(255,255,255,0.10-0.16) (brilho na borda de cima)

O segredo é esse box-shadow com inset — é o que faz parecer vidro de verdade com espessura, e não só "fundo transparente com blur". Sem isso fica plano.

Bônus: um div decorativo absoluto cobrindo o topo do card, com gradiente branco descendo de 8% de opacidade até 0 — simula luz refletindo (specular highlight). E uns círculos SVG decorativos no fundo, na cor de marca, bem sutis (opacidade 0.03 a 0.11), só pra dar profundidade.

TRANSIÇÕES
transition: all 0.2s a 0.3s cubic-bezier(0.4, 0, 0.2, 1) — o easing padrão do iOS/Material, sensação fluida.

RESUMINDO A VIBE
Tudo translúcido em camadas, nada de bordas duras ou fundo sólido opaco, cantos bem arredondados, sombras internas simulando reflexo de luz, cor de destaque usada com moderação (só em CTA/ativo/marca).
