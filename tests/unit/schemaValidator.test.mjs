import { validate } from '../../functions/utils/schemaValidator.mjs'

describe('userProfileUpdateSchema validator', () => {
  test('accepts valid email and password', () => {
    const data = { email: 'test@example.com', password: 'securePass123' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(true)
    expect(errors).toBeNull()
  })

  test('rejects invalid email', () => {
    const data = { email: 'not-an-email', password: 'securePass123' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(false)
    expect(errors).toBeTruthy()
  })

  test('rejects short password', () => {
    const data = { email: 'test@example.com', password: '123' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(false)
    expect(errors).toBeTruthy()
  })

  test('rejects extra properties', () => {
    const data = { email: 'test@example.com', password: 'securePass123', extra: 'oops' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(false)
    expect(errors).toBeTruthy()
  })

  test('accepts only email update', () => {
    const data = { email: 'new@example.com' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(true)
    expect(errors).toBeNull()
  })

  test('accepts only password update', () => {
    const data = { password: 'newSecurePass' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(true)
    expect(errors).toBeNull()
  })

  test('rejects password with forbidden characters', () => {
    const data = { email: 'test@example.com', password: 'bad<pass' }
    const { valid, errors } = validate('userProfileUpdateSchema', data)
    expect(valid).toBe(false)
    expect(errors).toBeTruthy()
  })
})

