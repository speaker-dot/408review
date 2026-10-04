import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath,URL } from 'node:url'
export default defineConfig({plugins:[vue()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'jsdom',pool:'threads',maxWorkers:1,minWorkers:1,setupFiles:['tests/setup.ts'],include:['tests/**/*.test.ts'],fileParallelism:false,restoreMocks:true,clearMocks:true}})
