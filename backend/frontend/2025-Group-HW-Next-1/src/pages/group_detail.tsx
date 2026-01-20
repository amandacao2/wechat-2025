import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Avatar, Button, Card, List, message, Spin, Input, Popconfirm, Badge , Typography } from "antd";
import {
    ArrowLeftOutlined,
    UserOutlined,
    EditOutlined,
    DeleteOutlined,
    CrownOutlined,
    BellOutlined,
    PlusOutlined,
    MessageOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

// 群详情类型
interface GroupDetail {
    id: number;
    name: string;
    avatar?: string;
    description?: string;
    member_count: number;
    notice: string[];
    owner: {
        userId: number;
        username: string;
        nickname: string;
        avatar?: string;
    };
    is_muted: boolean;
    members: GroupMember[];
}

// 群成员类型
interface GroupMember {
    userId: number;
    username: string;
    nickname: string;
    avatar?: string;
    role: "owner" | "admin" | "member";
    joined_at: string;
}

const GroupDetailScreen = () => {
    const router = useRouter();
    const { group_id } = router.query;
    const { token } = useSelector((state: RootState) => state.auth);
    const [groupDetail, setGroupDetail] = useState<GroupDetail | undefined>(undefined);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [loading, setLoading] = useState(true);
    // const [errorMsg, setErrorMsg] = useState("");
    const [currentUserId, setCurrentUserId] = useState(0);
    const [editingTitle, setEditingTitle] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [uploadImage, setUploadImage] = useState<File | undefined>(undefined);
    const [imageString, setImageString] = useState<string>("");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        setErrorMsg("");
    }, [newGroupName, uploadImage, editingTitle]);

    // 获取当前用户ID
    useEffect(() => {
        if (typeof window === "undefined") return;
        const authInfo = window.localStorage.getItem("authInfo");
        if (authInfo) {
            try {
                setCurrentUserId(JSON.parse(authInfo).user_id || 0);
            } catch (err) {
                console.error("解析authInfo失败:", err);
            }
        }
    }, []);

    // 拉取群详情
    const fetchGroupDetail = async () => {
        if (!group_id || !token) return;
        setLoading(true);
        // setErrorMsg("");
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const res = await response.json();
            if (Number(res.code) === 0) {
                const {avatar: tmpAvatar, notice: tmpNotice, ...tmp} = res.results;
                setGroupDetail({...tmp, avatar: tmpAvatar === null ? "" : `${BACKEND_URL}${tmpAvatar}`, notice: tmpNotice});
                setMembers((res.results.members || []).map((it : GroupMember) => {
                    const {avatar, ...tmp} = it;
                    return {...tmp, avatar: avatar === null ? "" : `${BACKEND_URL}${avatar}`};
                }));
            } else {
                // setErrorMsg(res.info || "Failed to load group detail");
                message.error(res.info || "获取群详情失败");
            }
        } catch (err) {
            const errStr = FAILURE_PREFIX + String(err);
            // setErrorMsg(errStr);
            message.error(errStr);
        } finally {
            setLoading(false);
        }
    };

    // 初始化拉取数据
    useEffect(() => {
        if (group_id && token) fetchGroupDetail();
    }, [group_id, token]);

    // 判断权限
    const isOwner = () => groupDetail?.owner.userId === currentUserId;
    const isAdmin = () => members.find(m => m.userId === currentUserId)?.role === "admin";
    const hasManagePermission = () => isOwner() || isAdmin();

    // 切换群免打扰
    const toggleGroupMute = async () => {
        if (!group_id || !groupDetail) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/mute/`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ muted: !groupDetail.is_muted }),
            });
            const res = await response.json();
            if (Number(res.code) === 0) {
                setGroupDetail(prev => 
                    prev ? { ...prev, is_muted: !prev.is_muted } : undefined
                );
                message.success(groupDetail.is_muted ? "已关闭群免打扰" : "已开启群免打扰");
            } else {
                message.error(res.info || "切换免打扰失败");
            }
        } catch (err) {
            message.error(FAILURE_PREFIX + String(err));
        }
    };

    // 跳转群聊天
    const goToGroupChat = () => {
        if (!groupDetail) return;
        router.push({
            pathname: "/group_chat",
            query: {
                group_id: groupDetail.id.toString(),
                group_name: groupDetail.name,
                group_avatar: groupDetail.avatar,
            },
        });
    };

    // 跳转成员管理
    const goToMemberManagement = () => {
        if (!group_id) return;
        router.push({
            pathname: "/group_member_management",
            query: { group_id: group_id.toString() },
        });
    };

    // 跳转成员邀请
    const goToInviteMember = () => {
        if (!group_id || !groupDetail) return;
        router.push({
            pathname: "/group_invite",
            query: {
                group_id: group_id.toString(),
                group_name: groupDetail.name,
            },
        });
    };

    // 跳转群昵称设置
    const goToNicknameSetting = () => {
        if (!group_id || !groupDetail) return;
        router.push({
            pathname: "/group_nickname_setting",
            query: {
                group_id: group_id.toString(),
                group_name: groupDetail.name,
                current_nickname: members.find(m => m.userId === currentUserId)?.nickname || "",
            },
        });
    };

    // 跳转邀请审核界面
    const goToInvitationVerify = () => {
        if (!group_id || !groupDetail) return;
        router.push({
            pathname: "/group_invitation_verify",
            query: {
                group_id: group_id.toString(),
                group_name: groupDetail.name
            },
        });
    };

    // 退出群聊
    const handleQuitGroup = async () => {
        if (!group_id || !window.confirm("确定退出该群聊吗？退出后将不再接收群消息")) return;
        try {
            const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/quit/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const res = await response.json();
            if (Number(res.code) === 0) {
                message.success("已退出群聊");
                router.push("/group_list");
            } else {
                message.error(res.info || "退出群聊失败");
            }
        } catch (err) {
            message.error(FAILURE_PREFIX + String(err));
        }
    };

    // 转让群主
    const handleTransferOwner = () => {
        if (!group_id || !isOwner()) return;
        message.info("请在成员管理中选择要转让的成员");
        goToMemberManagement();
    };

    const switchEditTitle = () => {
        setEditingTitle(prev => !prev);
        setNewGroupName(groupDetail ? groupDetail.name : "");
        setUploadImage(undefined);
    };

    const handleGroupNameChange = (value: string) => {
        setNewGroupName(value);
    };
    
    const handleUploadImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setUploadImage(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setImageString(event.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const sendTitle = async () => {
        const requestFormData = new FormData();
        requestFormData.append("name", newGroupName);
        if (uploadImage) requestFormData.append("avatar", uploadImage);
        const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: requestFormData
        });
        const res = await response.json();

        if (res.code === 0) {
            setGroupDetail(prev => prev = prev ? {...prev, name: res.results.name, avatar: res.results.avatar === null ? "" : `${BACKEND_URL}${res.results.avatar}`} : undefined);
            setEditingTitle(false);
            setNewGroupName(groupDetail ? groupDetail.name : "");
            setUploadImage(undefined);
        } else {
            setErrorMsg(`修改失败：${res.info}`);
        }
    };

    // 加载状态
    if (loading) {
        return (
            <div style={{
                textAlign: "center",
                marginTop: "100px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
            }}>
                <Spin size="large" />
                <div style={{ marginTop: "16px", color: "#666", fontSize: "14px" }}>
                    正在加载群详情...
                </div>
            </div>
        );
    }

    if (!groupDetail || !group_id) {
        return (
            <div style={{ textAlign: "center", marginTop: "100px", color: "#ff4444" }}>
                <p>群信息无效，即将跳转群列表</p>
                <Button onClick={() => router.push("/group_list")} style={{ marginTop: "20px" }}>
                    前往群列表
                </Button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: "600px", margin: "20px auto", padding: "0 20px" }}>
            {/* 顶部导航栏 */}
            <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    type="text"
                    onClick={() => router.back()}
                    style={{ marginRight: "16px" }}
                />
                <h2 style={{ margin: 0, color: "#333" }}>群详情</h2>
            </div>

            {errorMsg && (
                <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
                {errorMsg}
                </p>
            )}

            {/* 群基础信息卡片 */}
            <Card style={{ marginBottom: "20px" }}>
                <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "16px"
                }}>
                    {/* 群头像 */}
                    <Avatar
                        src={!editingTitle || uploadImage === undefined ? groupDetail.avatar === "" ? "https://picsum.photos/100" : groupDetail.avatar : imageString}
                        size="large"
                        style={{ width: "80px", height: "80px" }}
                    />

                    {/* 群名称 + 成员数 */}
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: "0 0 8px 0", fontSize: "20px" }}>
                            {!editingTitle ? groupDetail.name : (
                                <input
                                    type="name"
                                    value={newGroupName || ""}
                                    onChange={e => handleGroupNameChange(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: "4px 4px",
                                        borderRadius: "4px",
                                        border: "2px solid #ccc",
                                        fontSize: "inherit",
                                        fontFamily: "inherit",
                                        fontWeight: "inherit",
                                        lineHeight: "inherit",

                                    }}
                                    placeholder="请输入群名称"
                                />
                            )}
                            {!editingTitle ? hasManagePermission() && (
                                <Button
                                    icon={<EditOutlined />}
                                    type="text"
                                    size="small"
                                    onClick={switchEditTitle}
                                    style={{ color: "#2196F3" }}
                                >
                                    编辑
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        type="text"
                                        size="small"
                                        onClick={sendTitle}
                                        style={{ color: "#2196F3" }}
                                    >
                                        保存
                                    </Button>
                                    <Button
                                        type="text"
                                        size="small"
                                        onClick={switchEditTitle}
                                        style={{ color: "#ff4444" }}
                                    >
                                        取消
                                    </Button>
                                </>
                            )}
                        </h3>
                        <p style={{ margin: "0 0 8px 0", color: "#666" }}>
                            {groupDetail.member_count} 成员 · 群主: {groupDetail.owner.nickname}
                        </p>
                        <p style={{ margin: 0, color: "#666" }}>
                            {groupDetail.description || "无群描述"}
                        </p>
                    </div>
                </div>

                {editingTitle && (
                    <input
                        type="file"
                        accept="image/*"
                        onChange={e => handleUploadImageChange(e)}
                        style={{ padding: "5px", fontSize: "14px" }}
                    />
                )}

                <div style={{
                    marginBottom: "20px" 
                }}>

                </div>

                {/* 群公告 */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        alignItems: "center", 
                        marginBottom: "8px" 
                    }}>
                        <h4 style={{ margin: 0, fontSize: "16px", color: "#333" }}>
                            群公告
                            {groupDetail.notice !== null && <Badge dot style={{ marginLeft: "8px" }} />}
                        </h4>
                        <Button
                            type="text"
                            size="small"
                            style={{ color: "#2196F3" }}
                            onClick={() => router.push({
                                pathname: "/group_notice_setting",
                                query: {
                                    group_id: group_id.toString(),
                                    group_name: groupDetail.name,
                                    enable: hasManagePermission()
                                }
                            })}
                        >
                            查看全部
                        </Button>
                    </div>
                    <div style={{
                        padding: "12px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "8px",
                        minHeight: "60px",
                        display: "flex",
                        alignItems: "center",
                    }}>
                        {groupDetail.notice && groupDetail.notice.length > 0 ? (
                            <List 
                                dataSource={groupDetail.notice}
                                style={{ width: "100%" }}  // 添加这行
                                renderItem={(content, index) => (
                                    <List.Item
                                        key={index}
                                        actions={[]}
                                        style={{ 
                                            display: "block", 
                                            padding: 14,  // 关键：去掉List.Item的默认padding
                                            margin: 0 
                                        }}
                                    >
                                        <div style={{
                                            width: "100%",
                                            padding: "20px",
                                            backgroundColor: "#f9f9f9",
                                            borderRadius: "8px",
                                            minHeight: "150px",
                                            whiteSpace: "pre-line",
                                            fontSize: "14px",
                                            color: "#333",
                                        }}>
                                            {content.trim() ? (
                                                <Text>{content}</Text>
                                            ) : (
                                                <Text style={{ color: "#999" }}>暂无内容</Text>
                                            )}
                                        </div>
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <p style={{ margin: 0, color: "#999" }}>暂无群公告</p>
                        )}
                    </div>
                </div>

                {/* 群操作按钮 */}
                <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                        icon={<MessageOutlined />}
                        onClick={goToGroupChat}
                        type="primary"
                        style={{ flex: 1 }}
                    >
                        进入群聊
                    </Button>
                    <Button
                        icon={<BellOutlined />}
                        onClick={toggleGroupMute}
                        style={{
                            flex: 1,
                            color: groupDetail.is_muted ? "#ff4444" : "#666",
                            textDecoration: groupDetail.is_muted ? "line-through" : "none",
                        }}
                    >
                        {groupDetail.is_muted ? "取消免打扰" : "免打扰"}
                    </Button>
                </div>
            </Card>

            {/* 群管理功能区 */}
            <Card style={{ marginBottom: "20px" }}>
                <h4 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#333" }}>
                    群管理
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* 群昵称设置 */}
                    <Button
                        icon={<UserOutlined />}
                        onClick={goToNicknameSetting}
                        style={{ justifyContent: "flex-start", paddingLeft: "16px" }}
                        type="text"
                    >
                        群昵称设置
                        <span style={{ marginLeft: "8px", color: "#666", fontSize: "12px" }}>
                            当前：{members.find(m => m.userId === currentUserId)?.nickname || "未设置"}
                        </span>
                    </Button>

                    {/* 成员管理 */}
                    <Button
                        icon={<UserOutlined />}
                        onClick={goToMemberManagement}
                        style={{ justifyContent: "flex-start", paddingLeft: "16px" }}
                        type="text"
                    >
                        成员管理
                        {hasManagePermission() && (
                            <span style={{ marginLeft: "8px", color: "#2196F3" }}>
                                (可移除/设管理员)
                            </span>
                        )}
                    </Button>

                    {/* 邀请审核（仅群主和管理员可见） */}
                    {hasManagePermission() && (
                        <Button
                            icon={<UserOutlined />}
                            onClick={goToInvitationVerify}
                            style={{ 
                                justifyContent: "flex-start", 
                                paddingLeft: "16px" 
                            }}
                            type="text"
                        >
                            邀请审核
                        </Button>
                    )}

                    {/* 邀请成员 */}
                    <Button
                        icon={<PlusOutlined />}
                        onClick={goToInviteMember}
                        style={{ justifyContent: "flex-start", paddingLeft: "16px" }}
                        type="text"
                    >
                        邀请成员
                    </Button>

                    {/* 转让群主（仅群主可见） */}
                    {isOwner() && (
                        <Button
                            icon={<CrownOutlined />}
                            onClick={handleTransferOwner}
                            style={{ 
                                justifyContent: "flex-start", 
                                paddingLeft: "16px", 
                                color: "#ff4444" 
                            }}
                            type="text"
                        >
                            转让群主
                        </Button>
                    )}

                    {/* 退出群聊 */}
                    <Popconfirm
                        title="确定退出该群聊吗？退出后将不再接收群消息"
                        onConfirm={handleQuitGroup}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            icon={<DeleteOutlined />}
                            style={{ 
                                justifyContent: "flex-start", 
                                paddingLeft: "16px", 
                                color: "#ff4444" 
                            }}
                            type="text"
                        >
                            退出群聊
                        </Button>
                    </Popconfirm>
                </div>
            </Card>

            {/* 群成员列表（显示前5个） */}
            <Card>
                <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    marginBottom: "16px" 
                }}>
                    <h4 style={{ margin: 0, fontSize: "16px", color: "#333" }}>
                        群成员
                    </h4>
                    <Button
                        onClick={goToMemberManagement}
                        type="text"
                        size="small"
                        style={{ color: "#2196F3" }}
                    >
                        查看全部
                    </Button>
                </div>

                <List
                    dataSource={members.slice(0, 5)}
                    grid={{ gutter: 16, column: 5 }}
                    renderItem={(member) => (
                        <List.Item>
                            <div style={{ textAlign: "center" }}>
                                <Avatar
                                    src={member.avatar === "" ? "https://picsum.photos/100" : member.avatar}
                                    size="large"
                                    style={{ marginBottom: "8px" }}
                                    onClick={() => router.push(`/profile?user_id=${member.userId}`)}
                                />
                                <p style={{ 
                                    margin: 0, 
                                    fontSize: "12px", 
                                    whiteSpace: "nowrap", 
                                    overflow: "hidden", 
                                    textOverflow: "ellipsis" 
                                }}>
                                    {member.nickname}
                                </p>
                                {member.role === "owner" && (
                                    <span style={{ fontSize: "10px", color: "#ff4444" }}>
                                        群主
                                    </span>
                                )}
                                {member.role === "admin" && (
                                    <span style={{ fontSize: "10px", color: "#2196F3" }}>
                                        管理员
                                    </span>
                                )}
                            </div>
                        </List.Item>
                    )}
                />
            </Card>
        </div>
    );
};

export default GroupDetailScreen;