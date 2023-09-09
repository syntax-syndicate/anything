import { createContext, useState, useContext, ReactNode } from "react";

interface NavigationContextInterface {
  nodePanel: boolean;
  setNodePanel: (option: boolean) => void;
  tomlPanel: boolean;
  setTomlPanel: (option: boolean) => void;
  debugPanel: boolean;
  setDebugPanel: (option: boolean) => void;
  settingsPanel: boolean;
  setSettingsPanel: (option: boolean) => void;
  nodeConfigPanel: boolean;
  setNodeConfigPanel: (option: boolean, node_id: string) => void;
  nodeId: string;
  closeAllPanelsOpenOne: (panelName: string, arg: any) => void;
}

export const NavigationContext = createContext<NavigationContextInterface>({
  nodePanel: true,
  setNodePanel: () => {},
  tomlPanel: true,
  setTomlPanel: () => {},
  debugPanel: true,
  setDebugPanel: () => {},
  settingsPanel: true,
  setSettingsPanel: () => { },
  nodeConfigPanel: true,
  setNodeConfigPanel: () => { },
  nodeId: "",
  closeAllPanelsOpenOne: () => {},
});

export const useNavigationContext = () => useContext(NavigationContext);

//TODO: keyboard shortcuts
export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [nodePanel, setNodePanel] = useState<boolean>(true);
  const [tomlPanel, setTomlPanel] = useState<boolean>(false);
  const [debugPanel, setDebugPanel] = useState<boolean>(true);
  const [settingsPanel, setSettingsPanel] = useState<boolean>(false);
  const [nodeConfigPanel, setNodeConfigPanel] = useState<boolean>(false);
  const [nodeId, setNodeId] = useState<string>("");

  const _setNodeConfigPanel = (option: boolean, node_id: string) => {
    setNodeConfigPanel(option);
    setNodeId(node_id);
  }

  const closeAllPanelsOpenOne = (panelName: string, arg?: any) => {

    setNodePanel(false);
    setTomlPanel(false);
    setDebugPanel(false);
    setSettingsPanel(false);
    setNodeConfigPanel(false);

    switch (panelName) {
      case "node":
        setNodePanel(true);
        break;
      case "toml":
        setTomlPanel(true);
        break;
      case "nodeConfig":
        _setNodeConfigPanel(true, arg);
        break;
      case "debug":
        setDebugPanel(true);
        break;
      case "settings":
        setSettingsPanel(true);
        break;
      default:
        break;
    }
  };

  return (
    <NavigationContext.Provider
      value={{
        nodePanel,
        setNodePanel,
        tomlPanel,
        setTomlPanel,
        debugPanel,
        setDebugPanel, 
        settingsPanel,
        setSettingsPanel,
        nodeConfigPanel,
        setNodeConfigPanel: _setNodeConfigPanel,
        nodeId,
        closeAllPanelsOpenOne,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};
