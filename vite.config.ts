import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base is the repo subpath so assets resolve under
// https://raman365.github.io/lumina-dragon/ ; kept as '/' in dev.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/lumina-dragon/' : '/',
}))
