/**
 * Provider 插件配置弹窗
 * 用于在渠道管理页面加载和显示 provider 插件的配置 UI
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Spin, Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { InstalledPlugin, PluginExports, PluginAPI } from '../../types/plugin';
import { createPluginAPI } from '../../services/plugin/PluginAPI';
import { usePluginStore } from '../../store/pluginStore';
import { electronService } from '../../services/electronService';
import { createLogger } from '../../store/logger';

const logger = createLogger('ProviderPluginModal');

// 懒加载 antd 和 icons 暴露给插件（避免通配符导入拖累主 bundle）
async function exposeLibsToWindow(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 已经暴露过则跳过
  if ((window as any).__KOMA_LIBS_EXPOSED__) return;

  // React 直接用已导入的
  (window as any).React = React;

  // 动态导入完整的 antd 和 icons
  const [antd, antdIcons] = await Promise.all([
    import('antd'),
    import('@ant-design/icons'),
  ]);

  (window as any).antd = antd;
  (window as any)['@ant-design/icons'] = antdIcons;
  (window as any).__KOMA_LIBS_EXPOSED__ = true;
}

interface ProviderPluginModalProps {
  visible: boolean;
  pluginId: string;
  onClose: () => void;
  onConfigSaved?: () => void;
}

// 加载 Provider 插件前端组件
async function loadProviderPluginComponent(plugin: InstalledPlugin): Promise<PluginExports | null> {
  if (!plugin.entry.frontend) {
    logger.warn(`插件 ${plugin.id} 无前端入口`);
    return null;
  }

  // 规范化路径
  const frontendEntry = plugin.entry.frontend.replace(/^\.\//, '');
  const entryPath = `${plugin.rootPath}/${frontendEntry}`.replace(/\\/g, '/');

  // 通过 electronService 读取文件内容
  const scriptContent = await electronService.fs.readFile(entryPath);

  const globalKey = `__KOMA_PLUGIN_${plugin.id.replace(/[^a-zA-Z0-9]/g, '_')}__`;

  // 直接执行脚本内容
  try {
    // 使用 Function 构造器执行，确保在全局作用域
    const fn = new Function(scriptContent);
    fn.call(window);

    const module = (window as any)[globalKey];
    if (module) {
      return module;
    } else {
      throw new Error(`插件 ${plugin.id} 未正确导出到 window.${globalKey}`);
    }
  } catch (err: any) {
    logger.error(`执行插件脚本失败:`, err);
    throw new Error(`加载插件脚本失败: ${err.message}`);
  }
}

export const ProviderPluginModal: React.FC<ProviderPluginModalProps> = ({
  visible,
  pluginId,
  onClose,
  onConfigSaved: _onConfigSaved,
}) => {
  const { t } = useTranslation();
  const plugin = usePluginStore(state => state.getPlugin(pluginId));

  const [Component, setComponent] = useState<React.ComponentType<{ api: PluginAPI }> | null>(null);
  const [api, setApi] = useState<PluginAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugin = useCallback(async () => {
    if (!plugin) {
      setError(t('plugin.pluginNotExist'));
      setLoading(false);
      return;
    }

    if (!plugin.entry.frontend) {
      setError(t('plugin.noConfigUI'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 先暴露 antd/icons 给插件使用（懒加载）
      await exposeLibsToWindow();

      const exports = await loadProviderPluginComponent(plugin);

      if (!exports || !exports.default) {
        setError(t('plugin.noValidComponent'));
        return;
      }

      // 创建 API 实例
      const pluginApi = createPluginAPI(plugin);
      setApi(pluginApi);

      // 调用 onActivate
      if (exports.onActivate) {
        await exports.onActivate(pluginApi);
      }

      setComponent(() => exports.default);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [plugin, t]);

  useEffect(() => {
    if (visible && pluginId) {
      loadPlugin();
    }
  }, [visible, pluginId, loadPlugin]);

  // 关闭时清理
  const handleClose = () => {
    setComponent(null);
    setApi(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      title={plugin?.name || t('plugin.pluginConfig')}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={800}
      destroyOnClose
      className="dark-modal settings-compact-modal"
      styles={{ body: { maxHeight: '70vh', overflow: 'auto' } }}
    >
      {loading && (
        <div className="settings-loading-block">
          <Spin size="large" description={t('plugin.loadingPlugin')} />
        </div>
      )}

      {error && (
        <Result
          status="error"
          title={t('plugin.loadFailed')}
          subTitle={error}
          extra={
            <Button icon={<ReloadOutlined />} onClick={loadPlugin}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {!loading && !error && Component && api && (
        <Component api={api} />
      )}
    </Modal>
  );
};

export default ProviderPluginModal;
