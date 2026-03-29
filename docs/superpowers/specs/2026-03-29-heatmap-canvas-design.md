# Heatmap Canvas com Slider de Opacidade

## Problema

Os pontos de kill no mapa usam divs com opacity fixa. Quando vários kills acontecem no mesmo local, os pontos acumulam e ficam da mesma cor que o marcador da tumba, dificultando a diferenciação.

## Solução

Substituir os dots individuais por um heatmap real renderizado em canvas, com slider de opacidade embutido no mapa.

## Design

### Canvas Overlay

- `<canvas>` posicionado por cima da imagem do mapa, abaixo dos marcadores (tomb, sighting)
- Usa `simpleheat` (~2KB, zero deps) para renderizar
- Cada ponto do `heatmapPoints` alimenta o simpleheat com coordenadas convertidas para pixels do canvas
- Color map: transparente → amarelo → laranja → vermelho
- Raio do blur: ~15px (proporcional ao tamanho do componente)
- `pointer-events: none` no canvas — não interfere no click do mapa
- Canvas só re-renderiza quando `heatmapPoints` muda (useEffect com dep array)

### Slider de Opacidade

- `<input type="range">` no canto inferior direito do mapa, dentro do container
- Estilo discreto: semitransparente por default, mais visível no hover
- Range: 0% a 100%, default: 40%
- Controla `canvas.style.opacity`
- Valor persistido em `localStorage` (key: `heatmap-opacity`)
- z-index acima do canvas, abaixo dos marcadores

### Interação com Marcadores Existentes

Camadas (z-index crescente):
1. Imagem do mapa (base)
2. Canvas do heatmap
3. Slider de opacidade
4. Tomb marker / Sighting dot

### Edge Cases

- 0 heatmapPoints: não renderiza canvas nem slider
- Resize do container: canvas redimensiona junto (aspect-square, mesmo tamanho da imagem)
- SSR: componente já é "use client", canvas é client-only — sem issues

### Dependência

- `simpleheat` — npm package, ~2KB minified, sem deps
