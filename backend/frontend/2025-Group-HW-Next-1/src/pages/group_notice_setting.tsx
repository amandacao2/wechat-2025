import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Button, Card, List, Typography } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";

// 单独导入 Input 组件
import Input from "antd/es/input";

const { TextArea } = Input;
const { Text } = Typography;

interface GroupNotice {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  showTime: string;
  editing: boolean;
  newContent: string;
}

const GroupNoticeSettingScreen = () => {
  const router = useRouter();
  const { group_id, group_name, enable } = router.query;
  const { token } = useSelector((state: RootState) => state.auth);
  const [noticeList, setNoticeList] = useState<GroupNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 保存群公告
  const pullNotice = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/notice/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setNoticeList(res.results.map((notice: GroupNotice) => notice = {...notice, showTime: (new Date(notice.updatedAt)).toLocaleString("zh-CN", {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}), editing: false, newContent: notice.content}));
      } else {
        setErrorMsg(res.info || "获取公告失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      setErrorMsg(errStr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    pullNotice();
  }, []);

  const createNotice = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/notice/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({content : ""})
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setNoticeList(prev => [{...res.results, showTime: (new Date(res.results.updatedAt)).toLocaleString("zh-CN", {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}), editing: false, newContent: res.results.content}, ...prev]);
      } else {
        setErrorMsg(res.info || "创建公告失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      setErrorMsg(errStr);
    } finally {
      setLoading(false);
    }
  };

  const updateNotice = async (id: number, newContent: string) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/notice/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({id, content: newContent})
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setNoticeList(prev => [{...res.results, showTime: (new Date(res.results.updatedAt)).toLocaleString("zh-CN", {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}), editing: false, newContent: res.results.content}, ...prev.filter(it => it.id !== id)]);
      } else {
        setErrorMsg(res.info || "更新公告失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      setErrorMsg(errStr);
    } finally {
      setLoading(false);
    }
  };

  const deleteNotice = async (id: number) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/notice/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({id})
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setNoticeList(prev => prev.filter(it => it.id !== id));
      } else {
        setErrorMsg(res.info || "更新公告失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      setErrorMsg(errStr);
    } finally {
      setLoading(false);
    }
  };

  if (!group_id) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px", color: "#ff4444" }}>
        <p>群信息无效，即将返回群列表</p>
        <Button onClick={() => router.push("/group_list")} style={{ marginTop: "20px" }}>
          返回群列表
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px", margin: "20px auto", padding: "0 20px" }}>
      {/* 顶部导航 */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        margin: "20px 0" 
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => router.back()}
            style={{ marginRight: "16px" }}
          />
          <h2 style={{ margin: 0, color: "#333" }}>{group_name} - 群公告设置</h2>
        </div>
        
        {enable === "true" && (
          <Button
            icon={<PlusOutlined />}
            type="primary"
            size="middle"
            onClick={createNotice}
            style={{ padding: "6px 12px" }}
          >
            创建群公告
          </Button>
        )}
      </div>

      {errorMsg && (
        <p style={{ marginBottom: "16px", color: "#ff4444", fontSize: "14px" }}>
          {errorMsg}
        </p>
      )}

      <Card>
        <List
          dataSource={noticeList}
          renderItem={(notice) => (
            <List.Item
              key={notice.id}
              actions={[]}
              style={{ display: "block" }}
            >
              <div style={{ marginBottom: "16px" }}>
                {!notice.editing ? (
                  <div style={{
                    width: "100%",
                    padding: "20px",
                    backgroundColor: "#f9f9f9",
                    borderRadius: "8px",
                    minHeight: "150px",
                    whiteSpace: "pre-line",
                    fontSize: "14px",
                    color: "#333"
                  }}>
                    {notice.newContent.trim() ? (
                      <Text>{notice.content}</Text>
                    ) : (
                      <Text style={{ color: "#999" }}>暂无内容</Text>
                    )}
                  </div>
                ) : (
                  <TextArea
                    value={notice.newContent}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNoticeList(prev => prev.map(it => it.id === notice.id ? {...it, newContent: e.target.value} : it))}
                    placeholder="请输入群公告（支持换行，最多500字符）"
                    rows={8}
                    maxLength={500}
                    style={{ fontSize: "14px" }}
                    showCount
                  />
                )}
              </div>
              
              {/* 第二行：左侧更新时间 + 右侧按钮 */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", // 左右两端对齐
                alignItems: "center", // 垂直居中对齐
                width: "100%"
              }}>
                {/* 左侧更新时间 */}
                <div style={{ color: "#999", fontSize: "14px" }}>
                  更新时间: {notice.showTime || "未知"} {/* 假设notice对象中有updateTime字段 */}
                </div>
                
                {/* 右侧按钮组 */}
                {enable === "true" && (
                  <div style={{ 
                    display: "flex", 
                    gap: "8px"
                  }}>
                    {notice.editing ? (
                      <>
                        <Button
                          onClick={() => updateNotice(notice.id, notice.newContent)}
                          type="primary"
                        >
                          保存
                        </Button>
                        <Button
                          onClick={() => setNoticeList(prev => prev.map(it => it.id === notice.id ? {...it, editing: false} : it))}
                          type="default"
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <Button
                        icon={<EditOutlined />}
                        onClick={() => setNoticeList(prev => prev.map(it => it.id === notice.id ? {...it, editing: true, newContent: it.content} : it))}
                        type="text"
                        style={{color: "#2196F3"}}
                      >
                        编辑
                      </Button>
                    )}
                    <Button
                      icon={<DeleteOutlined />}
                      onClick={() => deleteNotice(notice.id)}
                      type="text"
                      style={{color: "#ff4444"}}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            </List.Item>
          )}
        ></List>
      </Card>
    </div>
  );
};

export default GroupNoticeSettingScreen;