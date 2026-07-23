import assert from 'node:assert/strict'
import test from 'node:test'

import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

import { proxy } from './proxy'

const originalSecret = process.env.JWT_SECRET
process.env.JWT_SECRET = 'codex-proxy-test-secret'

const requestFor = (path: string, role?: string) => {
  const headers = new Headers()
  if (role) {
    const token = jwt.sign({ sub: `${role}-user`, role }, process.env.JWT_SECRET!)
    headers.set('cookie', `backend_token=${token}`)
  }
  return new NextRequest(`http://localhost:3001${path}`, { headers })
}

test.after(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
})

test('redirects an unauthenticated protected request to login', () => {
  const response = proxy(requestFor('/client/plan'))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location')!).pathname, '/login')
})

test('redirects a client away from trainer pages', () => {
  const response = proxy(requestFor('/admin/clients', 'client'))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location')!).pathname, '/client')
})

test('redirects a trainer away from client pages', () => {
  const response = proxy(requestFor('/client/plan', 'trainer'))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location')!).pathname, '/admin')
})

test('allows a matching role to continue', () => {
  assert.equal(proxy(requestFor('/client/plan', 'client')).status, 200)
  assert.equal(proxy(requestFor('/admin/clients', 'admin')).status, 200)
})
