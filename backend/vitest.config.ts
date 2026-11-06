import { defineConfig } from 'vitest/config'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/managevent'
process.env.CLIENT_ORIGIN = 'http://localhost:5173'
process.env.JWT_SECRET = 'a-very-long-test-jwt-secret-key-32-chars!'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
