# Design — Globo VRChat (dot-matrix 3D)

**Data:** 2026-06-25
**Status:** Em revisão

## 1. Visão geral

Site de página única, minimalista, inspirado em https://www.sergiomusel.com/travelmap.
Um globo 3D em estilo **dot-matrix** que gira sozinho devagar e marca todas as regiões do
mundo onde o autor conheceu **pelo menos 1 pessoa no VRChat**. Cada região destacada tem
uma lista de nomes de pessoas. Fundo escuro (ou claro, ver tema), pontos claros, destaques
em **laranja**.

Objetivos centrais:
- Minimalista e **leve** (cliente só renderiza dados já pré-processados).
- Fácil de adicionar/destacar uma nova região editando um único arquivo de dados.
- "Inteligência" anti-aglomeração: nomes só aparecem com zoom suficiente e sem colidir.

## 2. Granularidade das regiões

- **14 países com sub-regiões** — unidade = **estado/província (admin-1)**. O país inteiro
  **nunca** é marcável nesses casos:
  Brasil, Argentina, EUA, Canadá, Austrália, Inglaterra, Alemanha, Itália, França, Espanha,
  Noruega, Suécia, Finlândia, Japão.
- **Todos os demais países** — unidade = **país inteiro (admin-0)**.

## 3. Globo e estilo visual

- Superfície **dot-matrix**: pontos sobre a terra formando os continentes; o litoral é
  definido pela própria borda dos pontos (sem linha de costa explícita).
- **Globo transparente**: não existe esfera sólida. Os pontos do lado oposto do planeta são
  visíveis "através" do globo, com **opacidade reduzida conforme a profundidade** (dica de
  profundidade), igual à referência.
- **Duas densidades de pontos:**
  - **Contorno/borda:** pontos **mais densos e mais destacados** (mais brilhantes/opacos),
    traçando o contorno dos territórios.
  - **Preenchimento do território:** pontos **mais espaçados e mais discretos** (mais
    apagados), preenchendo o interior das regiões.
- **Linhas finas** desenhando bordas **intra-continentais**: divisas entre países dentro de
  um mesmo continente + divisas de estados nos 14 países. (Sem bordas redundantes no litoral.)
- **Destaque de região (requisito B):** **todos** os pontos da região — tanto os densos de
  contorno quanto os esparsos de preenchimento — acendem em **laranja**, pintando o **formato
  exato e preenchido** do estado/país (importante para distinguir estados pequenos na Europa).
- **Tipografia:** **Rajdhani** em tudo, diferenciando usos por peso/tamanho/estilo:
  - Label de região (cursor): peso SemiBold/Bold, **MAIÚSCULAS**, com letter-spacing.
  - Lista de pessoas: peso Regular/Light, menor.
  - (Opcional) título de abertura também em Rajdhani Bold.

## 4. Tema (Light/Dark mode)

- Variáveis CSS para: cor de fundo, cor dos pontos, cor das bordas, cor do texto.
- **Laranja do destaque é constante** (legível em ambos os temas).
- Segue `prefers-color-scheme` por padrão; **botão de toggle** persiste a escolha em
  `localStorage`.
- Dark: fundo escuro, pontos claros. Light: fundo claro, pontos escuros.

## 5. Interação e níveis de zoom (a "inteligência")

**Controles:**
- Auto-rotação lenta contínua.
- Arrastar com **botão esquerdo** gira o globo.
- **Scroll** dá zoom.
- A auto-rotação **pausa ao interagir** e **volta após um tempo ocioso**.

**Limites de zoom** (raio do globo `R = 1`, via `OrbitControls.minDistance/maxDistance`;
valores ajustáveis):
- **Zoom-out máximo:** distância da câmera = `2.6·R` (globo cabe inteiro, sem voar pro vazio).
- **Zoom-in máximo:** `1.15·R` (perto o suficiente pra ler a Europa apertada, sem atravessar
  a superfície).

**Três níveis de zoom (anti-aglomeração)** — por faixa de distância da câmera:
- **Longe (`> 2.0·R`):** o globo dot-matrix **inteiro** está visível (todos os países,
  destacados ou não); as regiões destacadas se distinguem apenas pelo **laranja**. Sem texto.
- **Médio (`1.4·R`–`2.0·R`):** começam a aparecer as **listas de pessoas** (centralizadas no
  centroide da região), porém só onde **não colidem** na tela — regiões grandes/isoladas
  primeiro; Europa apertada ainda oculta.
- **Perto (`< 1.4·R`):** todas as listas da área visível aparecem.

**Regra anti-sobreposição:** listas que colidiriam ficam **ocultas** e só aparecem quando o
zoom as separa o suficiente (sem agrupar/contador "+N" de regiões — a separação é pelo zoom).

**Label de região (segue o cursor):** ao passar o mouse sobre uma região destacada, o nome
da região/país aparece **fixado logo acima do cursor**, com **fade in/out**.

**Listas longas:** se a lista de nomes ficar muito vertical, mostra **top 5 em ordem
alfabética** + um **botão "+"** que expande a lista completa, exibindo também um **contador
do total**.

## 6. Modelo de dados (edição pelo autor)

Identificação por **código ISO 3166** (Opção A):
- País = ISO 3166-1 alpha-2 (ex.: `"JP"`, `"FR"`).
- Estado/província = ISO 3166-2 (ex.: `"BR-SP"`, `"US-CA"`, `"JP-13"`).

Um único arquivo de dados editável, mapeando região → lista de pessoas:

```json
{
  "BR-SP": ["Alice", "Bob"],
  "US-CA": ["Carol"],
  "FR": ["Dave", "Erin"]
}
```

Acompanha o projeto uma **tabela de referência ISO 3166** (`iso-reference.md`), gerada no
build, listando os códigos de todos os países + os códigos admin-1 dos 14 países.

## 7. Arquitetura técnica

**Stack:** Vite + JavaScript vanilla + three.js. Build estático, hospedável em qualquer host
estático (GitHub Pages / Vercel / Netlify — a decidir).

### 7.1 Pipeline de pré-processamento (build, Node)

Entrada: geometria do **Natural Earth**:
- admin-0 (países) para todos os países.
- admin-1 (estados/províncias) filtrado para os 14 países.

O script gera (em `/public/data/`):
- `points.json` — malha de pontos sobre a terra; cada ponto `{lat, lon, regionId, tier}`,
  atribuído à sua região via **point-in-polygon**. `tier` distingue **contorno** (denso,
  destacado) de **preenchimento** (esparso, discreto) — controla densidade e
  brilho/opacidade no render.
- `borders.json` — segmentos de linha das bordas intra-continentais (países + estados dos 14).
- `regions.json` — por região `{id, name, centroid: {lat, lon}}`.
- `iso-reference.md` — tabela de consulta dos códigos ISO.

### 7.2 Arquivo de dados do autor

- `highlights.json` — `{ regionId: [nomes...] }` (ver seção 6).

### 7.3 Módulos de runtime (navegador)

- `globe.js` — constrói os `Points` do three.js (uma `BufferGeometry` única com atributo de
  cor por ponto) + `LineSegments` das bordas, sobre uma esfera. Globo transparente
  (sem esfera sólida; profundidade controla opacidade dos pontos do lado oposto).
- `controls.js` — `OrbitControls`: auto-rotação, arrasto, zoom, pausa/retomada.
- `highlight.js` — lê `highlights.json` e recolore para laranja os pontos cujo `regionId`
  está no conjunto de destacados.
- `labels.js` — camada **HTML/CSS** sobreposta: label de região via raycasting (hover);
  listas de pessoas projetando os centroides 3D→tela; visibilidade por nível de zoom;
  culling por colisão em coordenadas de tela; top-5 + expandir.
- `theme.js` — toggle light/dark, `prefers-color-scheme`, `localStorage`, variáveis CSS.
- `main.js` — wiring e loop de render.

### 7.4 Fluxo de dados

- **Build:** Natural Earth → script de pré-processamento → `/public/data/*.json` + `iso-reference.md`.
- **Runtime:** `fetch` dos JSON → constrói geometria → loop de render: rotaciona, raycast de
  hover, projeta centroides, atualiza visibilidade/colisão dos labels.

### 7.5 Coordenadas

- Conversão lat/lon → ponto 3D na esfera (mapeamento esférico padrão).

## 8. Tratamento de erros e casos de borda

- `regionId` em `highlights.json` sem geometria correspondente → **aviso no console** (dev) e
  ignora a entrada.
- Lista de pessoas vazia → região ainda é destacada; mostra só o label de região, sem lista.
- Colisão de labels calculada **apenas para as regiões destacadas visíveis** por frame (barato).

## 9. Performance

- ~15–30k pontos numa única `BufferGeometry`; destacar = atualizar um subconjunto do atributo
  de cor. Bordas como `LineSegments` único. Meta: 60 fps.
- Cliente não faz point-in-polygon (tudo pré-processado no build).

## 10. Testes

- **Script de build:** atribuição point-in-polygon — coordenadas conhecidas → `regionId`
  esperado.
- **Validação de dados:** todo `regionId` de `highlights.json` existe em `regions.json`;
  avisa em divergência.
- **Lógica de labels:** teste de sobreposição/colisão em coordenadas de tela; lógica de
  truncamento top-5 + contador.
- **Verificação visual manual** do globo, transparência e níveis de zoom.

## 11. Fora de escopo (YAGNI)

- Sem backend/banco de dados (site estático; dados editados no código).
- Sem painel lateral de detalhes (nomes ficam centralizados na própria região).
- Sem agrupamento "+N" de regiões (separação é pelo zoom).
- Sem edição via interface (apenas pelo arquivo de dados).
