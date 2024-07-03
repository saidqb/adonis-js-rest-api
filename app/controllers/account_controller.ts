import { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { cuid } from '@adonisjs/core/helpers'
import vine from '@vinejs/vine'
import BaseController from '#core/base_controller'
import User from '#models/user'
import { uniqueRule } from '#rules/unique'
import fs from 'node:fs'

export default class AccountController extends BaseController {

  async show({ auth }: HttpContext) {
    const user = await auth.authenticate()

    this.response('User retrieved successfully', { item: user })
  }

  async update({ auth, request }: HttpContext) {
    const user = await auth.authenticate()
    const payload = request.body()
    const validator = vine.compile(
      vine.object({
        password: vine.string().minLength(8).maxLength(32).confirmed().optional(),
        name: vine.string().optional(),
        photo: vine.string().optional(),
        email: vine
          .string()
          .email()
          .use(uniqueRule({ table: 'users', column: 'email', except: user.id, exceptColumn: 'id' }))
          .optional(),
      })
    )
    const output = await validator.validate(payload)

    const photo = request.file('photo', {
      size: '2mb',
      extnames: ['jpg', 'png', 'jpeg'],
    })

    // upload photo
    if (photo) {
      if (!photo.isValid) {
        return this.responseError('Validation error', 412, photo.errors)
      }

      // delete old file
      if (user.photo) {
        fs.unlink(app.makePath(`uploads/user-photo/${user.photo}`), (err) => {
          if (err) console.error('Error removing file:', err)
        })
      }

      await photo.move(app.makePath('uploads/user-photo'), {
        name: `${cuid()}.${photo.extname}`,
      })

      output.photo = photo.fileName!
    }

    await user?.merge(output).save()

    this.response('User updated successfully', user)
  }

  async refresh_token({ auth }: HttpContext) {
    const user = await auth.authenticate()
    await User.accessTokens.delete(user, user.currentAccessToken.identifier)

    // create new token
    const token = await User.accessTokens.create(user, ['*'], {
      name: cuid(),
    })

    this.response('Refresh token successfully', { item: user, user_token: token })
  }

  async logout({ auth }: HttpContext) {
    const user = await auth.authenticate()
    await User.accessTokens.delete(user, user.currentAccessToken.identifier)

    this.response('Logout successfully')
  }
}
