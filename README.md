# Americano de Pádel

App para gestionar campeonatos americanos de pádel: múltiples campeonatos (5ta, 4ta), fechas de 8 jugadores con rotación automática o cruces editables, carga de resultados, bonus 5/3/2 y tabla general. Los datos viven en Supabase y se sincronizan en tiempo real entre todos los que la usen.

Stack: Vite + React + Supabase, deploy en Netlify (mismo flujo que ya usás: GitHub → Netlify).

## Puesta en marcha (una sola vez, ~20 min)

### 1. Supabase
1. Entrá a https://supabase.com → **New project** (podés usar tu cuenta existente). Nombre sugerido: `americano-padel`. Región: `South America (São Paulo)`.
2. Cuando termine de crearse, andá a **SQL Editor → New query**, pegá TODO el contenido de `supabase-schema.sql` y tocá **Run**. Tiene que decir "Success".
3. Andá a **Project Settings → API** y copiá:
   - **Project URL** (ej: `https://abcd1234.supabase.co`)
   - **anon public key** (la larga que empieza con `eyJ...`)

### 2. Probar en tu máquina (opcional pero recomendado)
En Git Bash:
```bash
cd americano-padel
cp .env.example .env
# Editá .env y pegá tu URL y anon key
npm install
npm run dev
```
Abrí http://localhost:5173 y probá crear un campeonato.

### 3. Subir a GitHub
```bash
git init
git add .
git commit -m "Americano de padel v1"
```
Creá el repo `americano-padel` en GitHub (con tu usuario `jose45sierra97-code`) y:
```bash
git remote add origin https://github.com/jose45sierra97-code/americano-padel.git
git branch -M main
git push -u origin main
```

### 4. Netlify
1. En Netlify: **Add new site → Import an existing project → GitHub** → elegí `americano-padel`.
2. Detecta solo el build (`npm run build`, carpeta `dist`) gracias al `netlify.toml`.
3. **Antes de deployar**, en **Site configuration → Environment variables** agregá:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
4. Deploy. Te queda una URL fija tipo `https://americano-padel.netlify.app` (podés cambiar el nombre en Site configuration → Site details).

### 5. Compartir
Pasale la URL al otro administrador y listo: los dos ven y editan los mismos datos, con sincronización en tiempo real (lo que carga uno aparece solo en la pantalla del otro, sin refrescar). En el celular pueden "Agregar a pantalla de inicio" para tenerla como app.

## Notas
- **Sin login por ahora**: cualquiera con la URL puede editar. Para un torneo entre conocidos alcanza; si más adelante querés restringir (PIN de administrador o login de Supabase Auth), es un agregado chico.
- **Actualizaciones**: editás el código, `git push`, y Netlify redeploya solo. Los datos NO se pierden porque viven en Supabase.
- **Backup**: desde Supabase → Table Editor podés exportar las tablas a CSV cuando quieras.

## Estructura
```
├── supabase-schema.sql   ← ejecutar en Supabase (paso 1)
├── netlify.toml          ← config de build para Netlify
├── .env.example          ← plantilla de variables de entorno
├── index.html
└── src/
    ├── main.jsx
    ├── supabase.js       ← cliente de Supabase (lee las variables VITE_*)
    └── App.jsx           ← toda la aplicación
```
