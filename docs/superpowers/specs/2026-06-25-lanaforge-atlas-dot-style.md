# Lanaforge Atlas — Estilo do globo dot-matrix (revisão v2)

**Data:** 2026-06-25
**Status:** Em alinhamento (revisão pós-validação visual)
**Substitui** as seções de estilo de pontos/bordas do design original
(`2026-06-25-vrchat-globe-design.md`). O resto do design (zoom tiers, labels,
pílula de hover, tema light/dark, modelo de dados ISO) continua valendo.

> **Renomeação:** o projeto passa a se chamar **Lanaforge Atlas**. Toda
> referência a "VRChat"/"vrchat-globe" é removida (nome do pacote, README,
> `<title>`, docs, comentários). Sem menção a VRChat em lugar nenhum.

---

## 1. Mudança de granularidade: 14 → 4 países em nível de estado

Apenas **4 países** são marcados em nível de **estado/província (admin-1)**;
para todos os outros, a unidade é o **país inteiro (admin-0)**:

- **Brasil (BR), Estados Unidos (US), Canadá (CA), Japão (JP).**

Saem da lista (voltam a ser país inteiro): Argentina, Austrália, Reino Unido,
Alemanha, Itália, França, Espanha, Noruega, Suécia, Finlândia. Ou seja, nada
de divisão estadual na Europa/UK, nem na Argentina/Austrália.

`config.js`: `FOURTEEN` vira `STATE_LEVEL = ['BR', 'US', 'CA', 'JP']`.

---

## 2. Princípios visuais (alvo = sergiomusel)

- Terra desenhada por um **grid de pontos aproximadamente uniforme** (como o
  Sergio), **pontos REDONDOS** (não quadrados), pequenos, espaçados e em um
  **cinza suave / baixo contraste** (não preto sólido).
- **Sem linhas finas de borda.** As fronteiras são desenhadas com **pontos**,
  não com `LineSegments`. (O `borders.json`/`createBordersObject` atual é
  removido.)
- O **lado oposto do globo** continua mais apagado (depth fade já existente).
- Profundidade/contraste geral mais leve do que hoje, especialmente de longe.

---

## 3. Categorias de dots

Quatro categorias, cada uma com tamanho / opacidade / espaçamento / origem
geométrica próprios. As três primeiras são as que aparecem; a quarta é uma
**regra de filtragem**.

### 3.1 Dots Litorais (coast) — o contorno forte dos continentes
- **Origem:** linhas de costa (Natural Earth `coastline`).
- **Papel:** desenham o contorno terra-vs-oceano. É a categoria **mais
  destacada**.
- **Tamanho:** o **maior** (base).
- **Opacidade:** a **mais alta** (mais opaco).
- **Espaçamento:** **denso**, traçado **ao longo da linha de costa** (não no
  grid) — reamostragem por comprimento de arco.

### 3.2 Dots Terra (land) — preenchimento uniforme do território
- **Origem:** grid lat/lon, point-in-polygon dentro dos polígonos de país
  (admin-0; admin-1 para os 4).
- **Papel:** preenche o interior dos territórios de forma **uniforme**.
- **Tamanho:** **menor** que o litoral.
- **Opacidade:** **mais baixa / mais transparente** que o litoral.
- **Espaçamento:** **grid uniforme**, mais espaçado (o "fundo" pontilhado).

### 3.3 Dots Bordas Intra-Continentais (border) — fronteiras como pontos
- **Origem:** fronteiras **intra-continentais** entre países (Natural Earth
  `admin_0_boundary_lines_land` — já exclui o litoral) **+** as fronteiras de
  **estado dos 4 países** (admin-1 lines de BR/US/CA/JP).
- **Papel:** separar visualmente países vizinhos (e estados de BR/US/CA/JP)
  **sem** virar uma linha sólida nem um blocão. Resolve o problema de
  US+Canadá parecerem um país só (#7).
- **Tamanho:** **exatamente igual** ao dos **Dots Terra**.
- **Opacidade:** **exatamente igual** à dos **Dots Terra** (mesma
  transparência — portanto mais transparentes que o litoral).
- **Espaçamento:** **mais denso** que o grid da terra (pontos mais próximos
  entre si), traçado **ao longo da fronteira** (não no grid). Como têm a mesma
  cor/opacidade/tamanho da terra mas ficam mais juntos, formam uma "costura"
  pontilhada perceptível que delimita o país/estado sem peso visual.

### 3.4 Dots Ilhas (island) — DECISÃO: manter todas as ilhas
- **Decisão:** **não** filtrar ilhas por tamanho. Todas as massas de terra
  (incluindo ilhotas) geram dots normalmente (litoral + terra), porque o autor
  pode conhecer pessoas de países que são ilhas pequenas do Pacífico.
- A estranheza vista no #8 vinha dos **quadrados grandes**; com dots **redondos,
  pequenos e suaves** as ilhas/arquipélagos ficam limpos (como no Sergio, que
  mostra os arquipélagos pontilhados de forma intencional).
- Ilhas seguem exatamente as mesmas regras de Litoral + Terra das categorias
  3.1/3.2. Nenhum tratamento especial além de existirem.

---

## 4. Parâmetros propostos (defaults — ajustáveis depois de ver no browser)

Valores relativos; cor base = cor de dot do tema (cinza suave). Os números são
ponto de partida e serão afinados visualmente.

| Categoria | Tamanho (px aprox.) | Opacidade | Espaçamento | Origem |
|-----------|---------------------|-----------|-------------|--------|
| **Litoral** | ~2.6 (maior) | **~0.85 (bem forte)** | ~0.45° ao longo da costa | `coastline` |
| **Terra** | ~1.8 (menor) | **~0.30 (bem fraca)** | grid ~1.5° | grid ∩ polígonos |
| **Borda** | ~1.8 (= terra) | **~0.45 (um tiquinho acima da terra)** | ~0.7° ao longo da fronteira | `boundary_lines_land` + admin-1 dos 4 |
| **Ilhas** | — | — | — | sem filtro: rendem como Litoral+Terra |

Proporções confirmadas: **litoral bem mais forte** que a terra (contraste forte
contorno-vs-preenchimento, seguindo o Sergio); **borda um tiquinho acima da
terra**; terra bem fraca/suave.

- **Formato:** todos os dots são **círculos** (sprite/textura circular ou
  discard radial no shader). Sem `sizeAttenuation` exagerado (dots não devem
  inchar demais no zoom-in).
- **Depth fade:** lado oposto mais apagado (mantém o que já existe; piso de
  opacidade ajustável).

---

## 5. Destaque (highlight) das regiões com pessoas

- Mantém a escolha original **"B"**: os **próprios dots da região** (litoral +
  terra + borda daquela região) acendem em **laranja `#ff5a1f`**, pintando o
  formato exato. Laranja constante nos dois temas.
- Com o filtro de ilhas (3.4), o destaque de países com ilhotas (ex.: Portugal)
  fica limpo, só no território principal.
- **Confirmado:** mantém "B".

---

## 6. Outras mudanças de estilo nesta revisão (não-dots)

1. **Rotação ~70% mais lenta** (de `0.0009` rad/frame para ≈ `0.00027`).
2. **Auto-rotação pausa SOMENTE enquanto o botão esquerdo está pressionado**
   (arrasto) e **retoma assim que solta**. **Zoom (scroll) NÃO pausa** mais a
   rotação. (Remove o comportamento de pausa-por-ociosidade atual.)
3. **Sem `LineSegments` de borda** (substituído pelos Dots Bordas).
4. Renomeação completa para **Lanaforge Atlas**.

---

## 7. Impacto técnico (resumo — detalhar no plano)

- `config.js`: `STATE_LEVEL = ['BR','US','CA','JP']`; adicionar fonte
  `coastline` (Natural Earth) ao `SOURCES`.
- `scripts/lib/regions.mjs`: excluir admin-0 só dos 4; incluir admin-1 só dos 4.
- `scripts/lib/points.mjs`: gerar 3 categorias tagueadas (`coast`/`land`/
  `border`) a partir das fontes acima; aplicar filtro de ilhas por área.
- Remover `scripts/lib/borders.mjs` + `borders.json` + `createBordersObject`.
- `src/globe.js`: material de pontos redondos; tamanho/opacidade por categoria
  (provavelmente via atributos por-vértice de tamanho/opacidade, ou múltiplos
  objetos `Points`).
- `src/controls.js` / `main.js`: nova lógica de rotação (pausa só no arrasto).
- Atualizar `iso-reference.md` (agora só BR/US/CA/JP têm sub-regiões).

---

## 8. Decisões confirmadas (do feedback do autor)

1. **Ilhas:** manter todas (sem filtro por tamanho). ✓
2. **Borda:** opacidade um tiquinho acima da terra (não estritamente igual). ✓
3. **Highlight:** manter "B" (dots da região em laranja). ✓
4. **Contraste litoral × terra:** litoral bem mais forte que a terra, nas
   proporções do Sergio. ✓
