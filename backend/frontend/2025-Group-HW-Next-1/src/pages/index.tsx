// src/pages/index.tsx（新建，仅含基础结构，无游戏相关代码）
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { LOGIN_REQUIRED } from "../constants/string";

const HomeScreen = () => {
  const router = useRouter();
  const { isLogin } = useSelector((state: RootState) => state.auth);

  // 文档中约定的未登录拦截逻辑（参考 friend_list.tsx）
  const goToFriendList = () => {
    if (!isLogin) {
      alert(LOGIN_REQUIRED);
      router.push("/login");
      return;
    }
    router.push("/friend_list"); // 跳转到文档中的好友列表页面
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>欢迎使用用户系统</h2>
      <button
        onClick={goToFriendList}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          backgroundColor: "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        进入好友列表
      </button>
    </div>
  );
};

export default HomeScreen;