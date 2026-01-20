import Head from "next/head";
import "../styles/globals.css";
import type { AppProps } from "next/app";
import type { ComponentType } from "react";
import store from "../redux/store";
import { resetAuth } from "../redux/auth";
import { useRouter } from "next/router";
import { Provider, useSelector, useDispatch } from "react-redux";
import { RootState } from "../redux/store";

// 扩展类型：接收小写 component 参数
type CustomAppProps = AppProps & {
  component: ComponentType;
};

// 关键1：参数名用 component（小写，符合 ESLint 驼峰命名）
const App = ({ component, pageProps }: CustomAppProps) => {
  // 关键2：函数内重命名为 Component（大写，符合 JSX 组件规范）
  const Component = component;
  
  const router = useRouter();
  const dispatch = useDispatch();
  const { isLogin, name } = useSelector((state: RootState) => state.auth);

  // 登出逻辑（保留原有）
  const handleLogout = () => {
    dispatch(resetAuth());
    alert("已成功登出");
    router.push("/login");
  };

  return (
    <>
      <Head>
        <title>用户系统</title>
        <meta name="description" content="用户注册、登录、个人信息管理、群聊" /> {/* 新增：群聊描述 */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
        {/* 顶部导航栏 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "30px",
            paddingBottom: "15px",
            borderBottom: "1px solid #eee",
          }}
        >
          <h1 style={{ margin: 0, color: "#333", fontSize: "24px" }}>
            用户系统
          </h1>

          {/* 右侧操作区：新增「群列表」按钮 */}
          <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
            {isLogin ? (
              <>
                <span style={{ fontSize: "14px", color: "#666" }}>欢迎，{name}！</span>
                {/* 原有：好友列表 */}
                <button
                  onClick={() => router.push("/friend_list")}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #2196F3",
                    color: "#2196F3",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  好友列表
                </button>
                {/* 新增：群列表入口 */}
                <button
                  onClick={() => router.push("/group_list")}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #2196F3",
                    color: "#2196F3",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  群列表
                </button>
                {/* 原有：个人中心 */}
                <button
                  onClick={() => router.push("/profile")}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #2196F3",
                    color: "#2196F3",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  个人中心
                </button>
                {/* 原有：登出 */}
                <button
                  onClick={handleLogout}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ff4444",
                    color: "#ff4444",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  登出
                </button>
              </>
            ) : (
              <>
                {/* 未登录状态：保留原有逻辑 */}
                <button
                  onClick={() => router.push("/login")}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #2196F3",
                    color: "#2196F3",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  登录
                </button>
                <button
                  onClick={() => router.push("/register")}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "#2196F3",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  注册
                </button>
              </>
            )}
          </div>
        </div>

        {/* 关键3：用大写 Component 渲染（符合 JSX 规范） */}
        <Component {...pageProps} />
      </div>
    </>
  );
};

// Redux Provider 包装：传递小写 component 参数（保留原有）
export default function AppWrapper(props: AppProps) {
  const customProps = { ...props, component: props.Component };
  return (
    <Provider store={store}>
      <App {...customProps} />
    </Provider>
  );
}