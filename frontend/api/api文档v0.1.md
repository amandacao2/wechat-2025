# 基本约定

这些约定应该前端就保证？

用户名，应为非空字符串，且长度不大于 `50` 。

用户信息块：

```json
{
    "id": 7,
    "userName": "QwQ",
    "email": "qwq@qwq.com"
}
```

# 用户管理

## 基本管理

### 用户注册

#### URL `api/user/register/`

该 API 用于用户注册。

该 API 仅接受以 `POST` 方法请求。以其他方法请求均应当设置状态码为 `405 Method Not Allowed`，错误响应格式为：

```json
{
    "code": -3,
    "info": "Bad method"
}
```

##### POST

使用 `POST` 方法请求该 API 即表示用户请求注册。

###### 请求体

请求体格式为：

```json
{
    "userName": "QwQ",
    "email": "qwq@qwq.com",
    "password": "123456",
}
```

上述字段的说明为：
 - `userName` ：用户名。
 - `password` ：用户的密码。

###### 成功响应

当该用户名不存在时，需要创建该用户，设置状态码为 `200 OK` ，成功响应格式为：

```json
{
    "code": 0,
    "info": "Succeed",
}
```

###### 错误响应

所有错误响应的格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若该用户名存在，错误响应的状态码为 `409 Conflict` ， `code` 字段为 `-1` 。
 - 若读写数据中途抛出错误，错误响应的状态码为 `500 Internal Server Error` ， `code` 字段为 `-4` ， `info` 字段尽量携带错误信息。

### 用户注销

#### URL `api/user/delete/`

该 API 用于用户注销。

该 API 仅接受 `POST` 方法请求。以其他方式请求参考 `REF_BAD_METHOD` 。

##### POST

使用 `POST` 方法请求该 API 即表示用户请求注销。

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

请求体格式为：

```json
{
    "password": "123456"
}
```

###### 成功响应

请求成功时，应当设置状态码为 200 OK，成功响应格式为：

```json
{
    "code": 0,
    "info": "Succeed"
}
```

###### 错误响应

所有错误响应的格式均为：
```json
{
    "code": *,
    "info": "[Some message]"
}
```
 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若 `password` 验证不通过，错误响应代码为 `401 Unauthorized` ， `code` 字段为 `4` ， `info` 字段为 `"Password verification failed"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

## 用户认证

### 登入登出

#### URL `api/user/login/`

该 API 用于用户登入。

该 API 仅接受 `POST` 方法请求。以其他方式请求参考 `REF_BAD_METHOD` 。

##### POST

###### 请求体

请求体格式为：

```json
{
    "userName": "QwQ",
    "password": "123456"
}
```

###### 成功响应

核对 `userName` 与 `password` 匹配后，签发 JWT 令牌，设置状态码为 `200 OK` ，成功响应格式为：

```json
{
    "code": 0,
    "info": "Succeed",
    "token": "***.***.***" // JWT
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若 `userName` 不存在或 `password` 验证失败，错误响应的状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `Wrong userName or password` 。
 - 若读写数据中抛出错误，参考 `REF_INTERNAL_SERVER_ERROR` 。

#### URL `api/user/logout`

该 API 负责用户登出。

该 API 仅接受 `POST` 方法请求。以其他方法请求参考 `REF_BAD_METHOD` 。

##### POST

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

不需要任何信息。

###### 成功响应

核对 JWT 令牌与 `userName` 后，登出用户，成功响应格式如下：

```json
{
    "code": 0,
    "info": "Succeed",
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

### 信息编辑

#### URL `api/user/profile/<userName>`

该 API 负责用户信息获取和修改。

该 API 接受 `GET` 和 `POST` 方法请求。以其他方法请求参考 `REF_BAD_METHOD` 。

##### GET

获取用户 `userName` 的信息。

###### 请求体

不需要任何请求体

###### 成功响应

```json
{
    "code": 0,
    "info": "Succeed",
    "userData": {
        "id": 3,
        "userName": "QwQ",
        "email": "qwq@qwq.com"
    }
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若 `userName` 不存在，设置状态码为 `404 Not Found` ， `code` 为 `1` ， `info` 为 `User not exist` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

##### POST

修改用户 `userName` 的信息。

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

包含任意数量字段，为要修改的属性及其修改值。

```json
{
    "email": "qwq@qwq.com",
    // ...
}
```

###### 成功响应

成功修改 User 属性，设置状态码为 `200 OK` 。

```json
{
    "code": 0,
    "info": "Succeed"
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若 `userName` 与 JWT 令牌携带的 `userName` 不同，错误响应状态码为 `403 Forbidden` ， `code` 字段为 `3` ， `info` 字段为 `"Cannot modify other users"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

## 好友关系

### 用户查找

#### URL `api/user/search/`

该 api 仅接受 `GET` 方法。

##### GET

###### 请求体

`keyword` 为搜索关键词。

```json
{
    "keyword": "QwQ"
}
```

###### 成功响应

设置状态码为 `200 OK` 。

返回符合 `keyword` 搜索关键词的用户列表，格式如下：

```json
{
    "code": 0,
    "info": "Succeed",
    "userList": [
        {
            "id": 7,
            "userName": "QwQ",
            "email": "qwq@qwq.com"
        },
        // ...
    ]
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

### 好友申请

#### URL `api/user/friend-request/`

该 api 仅接受 `GET` 。

##### GET

给出所有与自己有关的好友申请（包括自己发起的和发给自己的，包括已接受，等待中，已拒绝）

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

不需要任何请求体。

###### 成功响应

返回所有与自己相关的好友申请，设置状态码 `200 OK` ，格式如下：

```json
{
    "code": 0,
    "info": "Succeed",
    "friendshipList": [
        {
            "from_user": {
                "id": 7,
                "userName": "QwQ",
                "email": "qwq@qwq.com"
            },
            "to_user": {
                "id": 8,
                "userName": "OwO",
                "email": "owo@owo.com"
            },
            "status": "pending",
            "created_at": 1669320727.6460,
            "updated_at": 1669320727.6460,
            "note": "I am QwQ."
        },
        // ...
    ]
}
```

 - `status=pending` 等待确认。
 - `status=accepted` 已接受。
 - `status=rejected` 已拒绝。
 - `status=blocked` 已拉黑。

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

#### URL `api/user/friend-request/send/`

该 api 仅接受 `POST` 。

##### POST

负责发起一个好友请求

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

包含发送申请的用户名，格式如下：

```json
{
    "userName": "OwO"
}
```

###### 成功响应

尝试创建好友申请，返回尝试结果，设置状态码为 `200 OK` 。

```json
{
    "code": 0,
    "info": "Succeed",
    "status": 2
}
```

 - `status=0` 成功创建申请。
 - `status=1` 被拉黑，无法申请。
 - `status=2` 已为好友关系，无效申请。

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若 `userName` 不存在，错误响应状态码为 `404 Not Found` ， `code` 字段为 `3` ， `info` 字段为 `"User not exist"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

#### URL `api/user/friend-request/respond/`

仅接受 POST 方法。

##### POST

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

包含发送申请的用户名，和选择的操作，格式如下：

```json
{
    "userName": "OwO",
    "operation": "reject"
}
```

 - `operation="accept"` 表示同意请求。
 - `operation="reject"` 表示拒绝请求。

###### 成功响应

回应好友申请，返回尝试结果，设置状态码为 `200 OK` 。

```json
{
    "code": 0,
    "info": "Succeed",
    "status": 1
}
```

 - `status=0` 成功同意或拒绝请求。
 - `status=1` 已拉黑，请先取消拉黑。
 - `status=2` 不存在待同意的请求。

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若 `userName` 不存在，错误响应状态码为 `404 Not Found` ， `code` 字段为 `3` ， `info` 字段为 `"User not exist"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

### 好友删除

#### URL `api/user/friend-remove/`

仅接受 POST 方法。

##### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

包含操作的好友用户名，格式如下：

```json
{
    "userName": "OwO"
}
```

###### 成功响应

尝试删除好友，返回尝试结果，设置状态码为 `200 OK` 。

```json
{
    "code": 0,
    "info": "Succeed",
    "status": 1
}
```

 - `status=0` 成功删除。
 - `status=1` 已拉黑，不用再删除。
 - `status=2` 不是好友，无法删除。

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若 `userName` 不存在，错误响应状态码为 `404 Not Found` ， `code` 字段为 `3` ， `info` 字段为 `"User not exist"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

### 好友列表

#### URL `api/user/friends/`

仅接受 GET 方法

##### GET

获取当前登录用户好友列表。

###### 请求头

使用 `POST` 方法请求该 API 时需要携带 JWT 令牌验证身份。请求头需要将 `Authorization` 字段设置为 JWT 令牌。

###### 请求体

不需要任何请求体

###### 成功响应

返回好友列表，设置状态码为 `200 OK` 。

```json
{
    "code": 0,
    "info": "Succeed",
    "friendList": [
        {
            "id": 7,
            "userName": "QwQ",
            "email": "qwq@qwq.com"
        },
        // ...
    ]
}
```

###### 错误响应

所有错误响应格式均为：

```json
{
    "code": *,
    "info": "[Some message]"
}
```

 - 若请求头中携带的 JWT 令牌无法通过验证或已经过期，错误响应状态码为 `401 Unauthorized` ， `code` 字段为 `2` ， `info` 字段为 `"Invalid or expired JWT"` 。
 - 若读取数据中抛出异常，参考 `REF_INTERNAL_SERVER_ERROR` 。

# 在线会话

# 群聊功能