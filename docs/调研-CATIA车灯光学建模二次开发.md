# CATIA 车灯光学建模二次开发调研报告

> 调研日期: 2026-05-02  
> 作者: 小猪 🐷  
> 状态: 完整调研

---

## 一、技术背景

### 1.1 车灯光学建模流程

车灯（Headlamp/Tail lamp）设计是汽车造型与光学性能的结合，核心流程：

```
造型曲面 → 配光分析 → 光学优化 → 工程图纸 → 模具开发
```

1. **造型曲面 (Styling)** — 车灯外部自由曲面，决定了车灯的视觉识别性
2. **反射器设计 (Reflector)** — 自由曲面反射器，控制光线分布
3. **透镜设计 (Lens/Projector)** — 自由曲面透镜或反射镜组，形成标准光型
4. **配光仿真 (Lighting Simulation)** — 验证光型是否符合法规（ECE/SAE/GB）
5. **工程验证 (Engineering)** — 生成 2D 图纸、DFM 分析

### 1.2 CATIA 在车灯设计中的地位

CATIA（现达索 Systèmes 3DEXPERIENCE）是车灯行业的主流 CAD 平台：

| 模块 | 用途 |
|------|------|
| **GSD (Generative Shape Design)** | 自由曲面建模（反射器/透镜曲面） |
| **IA (Interactive Analysis)** | 装配体干涉检查 |
| **DMU Kinematics** | 车灯装配体运动仿真 |
| **Photometric Module** | 光学分析（需特定许可证） |

---

## 二、二次开发技术栈

### 2.1 主要开发方式

| 开发方式 | 语言 | 适用场景 | 复杂度 |
|----------|------|----------|--------|
| **CAA V5 C++** | C++ | 核心功能插件、高性能计算 | ⭐⭐⭐⭐⭐ |
| **CATScript/VBScript** | VBScript | 快速原型、简单宏 | ⭐⭐ |
| **CATVBA** | VBA | 中等复杂度自动化 | ⭐⭐⭐ |
| **Python (via COM)** | Python | 数据分析、批量处理 | ⭐⭐⭐ |
| **REST API (3DEXPERIENCE)** | HTTP/REST | 云端协同、数据管理 | ⭐⭐⭐⭐ |

### 2.2 CAA V5 C++ 开发（重点推荐）

CAA V5 是 CATIA 的核心 API 框架，基于 C++ 和 COM/DCOM 架构。

#### 核心类层次

```
CATIProduct (产品)
├── CATIPrt (零件)
│   ├── CATIPart (CATPart 文档)
│   │   ├── CATIPrtContainer (零件容器)
│   │   ├── CATICoorSet (坐标系集合)
│   │   └── CATIPrtBody (几何体集合)
│   │       └── CATIPolyLine (曲线)
│   │           └── CATIPolygon (多边形面)
│   └── CATISpecObject (规范对象)
├── CATIMechanicalPart (机械零件)
└── CATIHybridShape (混合曲面)
    ├── CATIHybridShapePoint
    ├── CATIHybridShapeCurve
    └── CATIHybridShapeSurface
```

#### 车灯光学建模的关键 CAA 接口

| 接口 | 用途 |
|------|------|
| `CATIHybridShapeSurface` | 自由曲面创建/编辑 |
| `CATIHybridShapeIntersection` | 反射器/透镜与光线求交 |
| `CATIMeasurable` | 距离/角度/面积测量 |
| `CATIFacet` | 曲面三角剖分（用于光线追迹） |
| `CATIGsmWorkbench` | 几何学工作台 |
| `CATISpecServer` | 规范操作 |

#### 开发环境搭建

```bash
# 1. CATIA V5 R28+ 开发包 (CAA V5 SDK)
# 安装目录: /Applications/3DS/B28/CATEnv

# 2. 设置开发环境
source /Applications/3DS/B28/CATEnv CATIA_V5LANG

# 3. 编译 CAA 插件
cmake -DCATIA_R28=ON ..
make -j4
```

### 2.3 VBScript 宏（快速方案）

适合快速原型开发和简单自动化。

#### 示例：创建车灯反射器参考曲面

```vbscript
' Create Headlight Reflector Profile.vbs
Sub CATMain()
    Set catia = CreateObject("CATIA.Application")
    Set doc = catia.ActiveDocument
    Set part = doc.Part
    
    ' 获取混合曲面工作台
    Set hybridShapeFactory = part.HybridShapeFactory
    Set hybridBody = part.MainElement
    
    ' 创建反射器轮廓曲线 (基于配光需求)
    ' 1. 在 XZ 平面创建截面曲线
    Set point1 = hybridShapeFactory.AddNewPointCoord(0, 0, 0)
    Set point2 = hybridShapeFactory.AddNewPointCoord(0, 50, -30)
    Set point3 = hybridShapeFactory.AddNewPointCoord(0, 100, -80)
    
    ' 2. 三点拟合抛物线 (反射器基本形状)
    Set curve = hybridShapeFactory.AddNewCurvePolynomial(_
        point1, point2, point3)
    hybridBody.AppendHybridShape curve
    
    ' 3. 旋转生成反射器
    Set axis = part.GetItem("AbsoluteAxis")
    Set revolve = hybridShapeFactory.AddNewRevolve(_
        curve, axis, 360)
    hybridBody.AppendHybridShape revolve
    
    part.Update
    MsgBox "反射器曲面已生成"
End Sub
```

### 2.4 Python 集成方案

通过 CATIA 的 COM 接口，Python 可以控制 CATIA：

```python
import win32com.client
import numpy as np

class CATIACarina:
    """CATIA 车灯光学辅助工具"""
    
    def __init__(self):
        self.catia = win32com.client.Dispatch("CATIA.Application")
        self.catia.Visible = True
    
    def create_reflector_surface(self, profile_points, center=(0,0,0)):
        """
        根据配光截面点创建反射器旋转曲面
        :param profile_points: [(y, z), ...] 截面坐标
        :param center: 旋转中心
        """
        doc = self.catia.ActiveDocument
        part = doc.Part
        hsf = part.HybridShapeFactory
        
        # 创建截面点
        points = []
        for i, (y, z) in enumerate(profile_points):
            p = hsf.AddNewPointCoord(center[0], y, z)
            part.AppendShape(p)
            points.append(p)
        
        # 创建多项式曲线
        if len(points) >= 3:
            curve = hsf.AddNewCurvePolynomial(
                points[0], points[1], points[-1]
            )
            part.AppendShape(curve)
        
        # 旋转生成曲面
        axis = part.GetItem("AbsoluteAxis")
        revolve = hsf.AddNewRevolve(curve, axis, 360)
        part.AppendShape(revolve)
        part.Update()
    
    def analyze_light_distribution(self, surface, intensity_data):
        """
        分析光型分布
        :param surface: 被分析的曲面对象
        :param intensity_data: 配光数据 [角度, 光度]
        """
        # 获取曲面三角网格
        meas = surface.GetMeasurable()
        area = meas.GetDistance2Values()
        return area
```

---

## 三、车灯光学建模核心算法

### 3.1 自由曲面反射器设计

车灯反射器设计使用 **能量守恒映射法 (Conservation of Energy Mapping)**：

```
光源发光强度分布 I(θ,φ) → 反射器曲面 S → 目标配光分布 I'(θ',φ')
```

#### 算法流程

```
Step 1: 光源建模
    输入: LED 发光曲线 (Nist/IES 文件)
    输出: 光源强度分布 I(θ,φ)

Step 2: 能量分区 (Energy Segmentation)
    将光源球面分割为 N 个微元
    每个微元: ΔΩ_i = ∫∫ I(θ,φ) sinθ dθ dφ

Step 3: 映射计算 (Ray Mapping)
    输入能量: E_source_i = ∫_ΔΩ_i I(θ,φ) dΩ
    输出能量: E_target_j = ∫_ΔΩ'_j I'(θ',φ') dΩ'
    约束:   E_source_i = E_target_j  (能量守恒)
    计算反射点 P_i 和反射方向

Step 4: 曲面重构 (Surface Reconstruction)
    由离散点集 P_i + 法向量 N_i 重构自由曲面
    方法: 最小二乘拟合 / 径向基函数 (RBF)
```

### 3.2 配光标准要求

| 标准 | 区域 | 要求 |
|------|------|------|
| **GB 4785 (中国)** | 近光 | C-C', B-75', R-75' 有明暗截止线 |
| **ECE R112 (欧洲)** | 近光 | 50L/50R 区域亮度限制 |
| **SAE FMVSS 108 (美国)** | 近光 | Hot spot 限制, cutoff 线 |
| **ECE R19** | 远光 | 最小/最大发光强度 |
| **ECE R87** | 转弯灯 | 动态配光要求 |

---

## 四、二次开发完整方案

### 4.1 推荐技术架构

```
┌─────────────────────────────────────────────────┐
│              车灯光学二次开发平台                 │
├─────────────────────────────────────────────────┤
│  CATIA V5 R28+ (运行环境)                        │
│  ┌──────────┬──────────┬───────────┐            │
│  │ C++ CAA  │ VBScript │ Python    │            │
│  │ (核心模块)│ (快速原型)│ (数据分析)│            │
│  └──────────┴──────────┴───────────┘            │
│        │              │           │              │
│  ┌─────┴──────────────┴───────────┴──────────┐  │
│  │         车灯光学工具集 (Tool Collection)    │  │
│  ├───────────────────────────────────────────┤  │
│  │  · 反射器参数化生成器                      │  │
│  │  · 透镜曲面设计器                          │  │
│  │  · 配光预分析模块                          │  │
│  │  · 截面曲线生成器                          │  │
│  │  · 光束追迹模拟器 (简化版)                 │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 4.2 核心工具模块清单

#### 模块 1: 反射器参数化生成器

```cpp
// ReflectorParametricGen.cpp (CAA C++ 示例)
#include "CATIHybridShapeSurface.h"
#include "CATMathPoint.h"
#include "CATMathVector.h"

class ReflectorParametricGen {
public:
    // 根据配光参数生成自由曲面反射器
    static HRESULT Create(
        CATIPrtContainer_var spPartContainer,
        double focalLength,      // 焦距
        double aperture,         // 口径
        int    segmentCount,     // 能量分段数
        double** intensityProfile, // 配光曲线数据
        CATISpecObject_var& rpReflectorSurface  // 输出曲面
    );
    
    // 执行能量守恒映射
    static void EnergyConservationMapping(
        double* sourceEnergy,    // 光源能量分布
        double* targetEnergy,    // 目标配光
        int nSegments,
        CATMathPoint* rpPoints,  // 反射点
        CATMathVector* rpNormals // 法向量
    );
};
```

#### 模块 2: 透镜曲面设计器

```python
# LensDesigner.py
import numpy as np
from scipy.optimize import minimize

class LensDesigner:
    """车灯透镜曲面设计器"""
    
    def __init__(self, curvature_data):
        """
        :param curvature_data: 透镜曲率分布数据
        """
        self.curvature = curvature_data
    
    def generate_surface(self, width=200, height=150, grid=50):
        """生成透镜参数化曲面"""
        # 使用径向基函数重构曲面
        X = np.linspace(-width/2, width/2, grid)
        Y = np.linspace(-height/2, height/2, grid)
        X, Y = np.meshgrid(X, Y)
        Z = self._rbf_interpolation(X, Y)
        return X, Y, Z
    
    def _rbf_interpolation(self, X, Y):
        """径向基函数插值"""
        # 简化: 使用高斯 RBF
        center = np.array([[0, 0]])
        sigma = 50.0
        R = np.sqrt((X - center[0,0])**2 + (Y - center[0,1])**2)
        Z = np.exp(-R**2 / (2*sigma**2)) * self.curvature
        return Z
```

#### 模块 3: 配光预分析

```python
# LightingSimulator.py
class LightingSimulator:
    """简化版光束追迹模拟器"""
    
    def __init__(self, source_profile=None):
        """
        :param source_profile: 光源强度分布 (弧度 -> 坎德拉)
        """
        self.source_profile = source_profile or self._default_profile()
    
    def trace_ray(self, incidence_angle, reflector_normal):
        """
        追迹单条光线
        """
        # 反射定律: R = I - 2(I·N)N
        I = np.array([np.sin(incidence_angle), 0, -np.cos(incidence_angle)])
        N = reflector_normal / np.linalg.norm(reflector_normal)
        R = I - 2 * np.dot(I, N) * N
        return R
    
    def simulate_beam_pattern(self, reflector_surface, num_rays=1000):
        """
        模拟光型分布
        """
        angles = []
        intensities = []
        
        for _ in range(num_rays):
            theta = np.random.uniform(0, np.pi/4)
            phi = np.random.uniform(0, 2*np.pi)
            
            # 反射计算
            normal = self._get_surface_normal(theta, phi, reflector_surface)
            reflected = self.trace_ray(theta, normal)
            
            angles.append((theta, phi))
            intensities.append(self._evaluate_intensity(reflected))
        
        return angles, intensities
    
    def check_compliance(self, pattern, standard='GB4785'):
        """检查是否符合标准"""
        if standard == 'GB4785':
            return self._check_gb4785(pattern)
        elif standard == 'ECE':
            return self._check_ece(pattern)
    
    def _check_gb4785(self, pattern):
        """中国 GB 4785 标准检查"""
        # 近光明暗截止线检查
        cutoff_points = [(0, 0), (-0.67, -0.17), (0.67, -0.17)]
        for pt in cutoff_points:
            intensity = self._interpolate_intensity(pt, pattern)
            if intensity > 1000:  # 截止线区域限制
                return False, f"点 {pt} 超亮 ({intensity} cd)"
        return True, "通过"
```

---

## 五、行业主流方案对比

### 5.1 车灯 CAD/CAE 软件生态

| 软件 | 定位 | 光学能力 | 二次开发 |
|------|------|----------|----------|
| **CATIA V5** | 主建模 | 基础 (需模块) | CAA C++, VB, Python |
| **CATIA 3DEXPERIENCE** | 新一代平台 | 增强 | REST API, CAA |
| **LightTools** | 专业光学 | ⭐⭐⭐⭐⭐ | C++, C#, VB |
| **ASAP** | 高级光学 | ⭐⭐⭐⭐⭐ | C, Fortran |
| **Code V** | 镜头设计 | ⭐⭐⭐⭐⭐ | 内置脚本 |
| **DIALux** | 照明设计 | ⭐⭐⭐ | 有限 |
| **Aud内饰/Hypermesh** | 网格/工程 | 有限 | CAA/Python |

### 5.2 选择建议

| 场景 | 推荐方案 |
|------|----------|
| 仅做造型曲面建模 | VBScript 宏即可 |
| 需要快速验证配光 | Python + CATIA COM |
| 完整光学模块开发 | CAA C++ (性能最佳) |
| 云端协同/数据管理 | 3DEXPERIENCE REST API |
| 高精度光学仿真 | LightTools/ASAP (导出 STEP 给 CATIA) |

---

## 六、实施路线图

### Phase 1: 快速原型 (1-2 周)

- [ ] 搭建 VBScript 宏环境
- [ ] 实现反射器轮廓曲线生成
- [ ] 实现透镜截面曲面生成
- [ ] 基础配光检查

### Phase 2: CAA 开发 (4-6 周)

- [ ] 配置 CAA V5 开发环境
- [ ] 实现参数化反射器生成器 (CAA C++)
- [ ] 实现能量守恒映射算法
- [ ] 集成曲面质量检查

### Phase 3: 完整工具链 (8-12 周)

- [ ] 配光预分析模块 (Python + C++)
- [ ] 光束追迹模拟器
- [ ] 标准合规检查自动化
- [ ] CATIA 插件封装 (菜单/工具栏集成)

### Phase 4: 高级功能 (12+ 周)

- [ ] 优化算法集成 (遗传算法/粒子群)
- [ ] 与 LightTools 联合仿真
- [ ] 3DEXPERIENCE 云端部署
- [ ] 机器学习辅助设计

---

## 七、相关资源

### 7.1 官方文档

| 资源 | 链接 |
|------|------|
| CAA V5 开发文档 | `/Applications/3DS/B28/CNext/SAPIEN/docs/en-us/` |
| CAA V5 Sample | `/Applications/3DS/B28/CNext/SAPIEN/samples/` |
| 3DEXPERIENCE Developer Portal | https://developers.3ds.com |

### 7.2 车灯行业资料

| 资源 | 说明 |
|------|------|
| CATIA Body Styling with Car Design | Dassault 官方课程 |
| CATIA Surface Design for Automotive | Dassault 官方课程 |
| Lighting Engineering Handbook | 照明工程手册 |
| GB 4785-2019 | 中国车灯标准 |
| ECE R112 | 欧洲近光灯标准 |

### 7.3 关键技术关键词

```
CAA V5 API 二次开发
CATIA 自由曲面设计
车灯反射器能量守恒映射
配光分析 CATIA
透镜曲面设计
Optical Freeform Surface
LightTools + CATIA 协同
车灯参数化建模
光束追迹算法
CAD/CAM 车灯开发
```

---

## 八、总结与建议

### 8.1 核心结论

1. **CATIA V5 的 CAA C++ 是车灯光学二次开发的首选方案** — 性能最佳、能力最强
2. **VBScript/Python 适合快速原型和日常自动化** — 开发速度快
3. **光学计算 (光线追迹/优化) 建议用 Python/C++ 独立实现** — 不依赖 CATIA 内核算力
4. **高精度光学仿真建议联合 LightTools** — CATIA 做几何，LightTools 做光学

### 8.2 对本项目的建议

如果要在 CodeEngine 中集成 CATIA 二次开发能力：

```
推荐架构:
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CodeEngine  │────▶│  CATIA COM   │────▶│  CATIA V5    │
│  (任务调度)   │     │  自动化层     │     │  (几何建模)   │
└──────────────┘     └──────────────┘     └──────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │  Python      │
                     │  (光学计算)   │
                     └──────────────┘
                              │
                              ▼
                     ┌──────────────┐
                     │  LightTools  │
                     │  (高精度仿真) │
                     └──────────────┘
```

**下一步行动**:
1. 搭建 CATIA 开发环境 (需要本机安装 CATIA V5 R28+)
2. 编写第一个 CAA 插件 (反射器参数化生成器)
3. 集成 Python 光学计算模块
4. 编写测试用例 (catia-workflow.test.ts 扩展)
