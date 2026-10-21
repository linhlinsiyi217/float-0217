package app.floatphone.shell

import androidx.core.content.FileProvider

/**
 * 用子类而不是直接写 androidx 的 FileProvider：
 * 有些依赖（如相册选择库）会往 Manifest 里合并它们自己的 FileProvider，
 * 直接用同一个类会撞 authorities，编不过去。
 */
class UpdateFileProvider : FileProvider()
