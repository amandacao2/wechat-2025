import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Avatar, Button, Card, Input, List, message, Spin } from "antd";
import { ArrowLeftOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";

// 好友类型
interface Friend {
  id: number;
  username: string;
  nickname: string;
  avatar?: string;
  email: string;
  is_in_group: boolean;
}

const GroupInviteScreen = () => {
  const router = useRouter();
  const { group_id, group_name } = router.query;
  const { token } = useSelector((state: RootState) => state.auth);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  // const [errorMsg, setErrorMsg] = useState("");
  const [invitingIds, setInvitingIds] = useState<number[]>([]);

  // 拉取好友列表（排除已在群内的好友）
  const fetchFriends = async () => {
    if (!group_id || !token) return;
    setLoading(true);
    // setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/friends/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        // 拉取群内成员ID列表
        const groupMembersRes = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/ids/`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const groupMembersData = await groupMembersRes.json();
        const inGroupIds = groupMembersData.results || [];

        // 标记好友是否已在群内
        const formattedFriends = (res.friends || []).map((friend: any) => ({
          id: friend.id,
          username: friend.username,
          nickname: friend.nickname || friend.username,
          avatar: friend.avatar,
          email: friend.email,
          is_in_group: inGroupIds.includes(friend.id),
          is_invited: false
        }));
        setFriends(formattedFriends);
        setFilteredFriends(formattedFriends);
      } else {
        // setErrorMsg(res.info || "获取好友列表失败");
        message.error(res.info || "获取好友列表失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      // setErrorMsg(errStr);
      message.error(errStr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (group_id && token) fetchFriends();
  }, [group_id, token]);

  // 搜索好友
  const handleSearch = () => {
    const keyword = searchKeyword.toLowerCase();
    const filtered = friends.filter(friend =>
      friend.nickname.toLowerCase().includes(keyword) ||
      friend.username.toLowerCase().includes(keyword) ||
      friend.email.toLowerCase().includes(keyword)
    );
    setFilteredFriends(filtered);
  };

  // 发送群邀请
  const sendInvite = async (friendId: number, friendName: string) => {
    if (!group_id || !token) return;
    setInvitingIds(prev => [...prev, friendId]);
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/invitations/send/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: friendId }),
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        message.success(`已向 ${friendName} 发送群邀请`);
        alert("成功发送邀请");
        // 标记为"已邀请"（前端临时处理）
        // fetchFriends();
      } else {
        message.error(res.info || "发送邀请失败");
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    } finally {
      setInvitingIds(prev => prev.filter(id => id !== friendId));
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        <Spin size="large" />
        <p style={{ marginTop: "16px", color: "#666" }}>正在加载好友列表...</p>
      </div>
    );
  }

  if (!group_id || typeof group_name !== "string") {
    return (
      <div style={{ textAlign: "center", marginTop: "100px", color: "#ff4444" }}>
        <p>群信息无效，即将返回群详情</p>
        <Button onClick={() => router.push("/group_list")} style={{ marginTop: "20px" }}>
          返回群列表
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px", margin: "20px auto", padding: "0 20px" }}>
      {/* 顶部导航 */}
      <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => router.back()}
          style={{ marginRight: "16px" }}
        />
        <h2 style={{ margin: 0, color: "#333" }}>邀请好友加入 {group_name}</h2>
      </div>

      {/* 搜索框 */}
      <Card style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <Input
            placeholder="搜索好友（用户名/昵称/邮箱）"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ flex: 1 }}
          />
          <Button icon={<SearchOutlined />} type="primary" onClick={handleSearch}>
            搜索
          </Button>
        </div>
      </Card>

      {/* 好友列表 */}
      {filteredFriends.length > 0 ? (
        <Card>
          <List
            dataSource={filteredFriends}
            renderItem={(friend) => (
              <List.Item
                key={friend.id}
                actions={[
                  friend.is_in_group ? (
                    <Button type="text" disabled style={{ color: "#999" }}>
                      已在群内
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      loading={invitingIds.includes(friend.id)}
                      onClick={() => sendInvite(friend.id, friend.nickname)}
                    >
                      发送邀请
                    </Button>
                  )
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={friend.avatar || `${BACKEND_URL}/media/default-avatar.png`} />
                  }
                  title={friend.nickname}
                  description={`@${friend.username} | ${friend.email}`}
                />
              </List.Item>
            )}
          />
        </Card>
      ) : (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#999" }}>
          <UserOutlined style={{ fontSize: "48px", marginBottom: "16px" }} />
          <p>暂无符合条件的好友</p>
          <p style={{ marginTop: "8px" }}>可先添加好友后再邀请</p>
        </div>
      )}
    </div>
  );
};

export default GroupInviteScreen;