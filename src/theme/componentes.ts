// Customizações de componentes do tema, adaptadas dos templates oficiais
// shared-theme e dashboard do MUI v9.5.0, sem nenhum pacote Pro.
import { alpha, type Components, type Theme } from "@mui/material/styles";
import { buttonBaseClasses } from "@mui/material/ButtonBase";
import { chipClasses } from "@mui/material/Chip";
import { inputBaseClasses } from "@mui/material/InputBase";
import { listItemButtonClasses } from "@mui/material/ListItemButton";
import { menuItemClasses } from "@mui/material/MenuItem";
import { outlinedInputClasses } from "@mui/material/OutlinedInput";
import { selectClasses } from "@mui/material/Select";
import { svgIconClasses } from "@mui/material/SvgIcon";
import { switchClasses } from "@mui/material/Switch";
import { tabClasses } from "@mui/material/Tab";
import { toggleButtonClasses } from "@mui/material/ToggleButton";
import { toggleButtonGroupClasses } from "@mui/material/ToggleButtonGroup";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import { axisClasses, chartsGridClasses, legendClasses } from "@mui/x-charts";
import type { ChartsComponents } from "@mui/x-charts/themeAugmentation";
import { monthCalendarClasses, pickerDayClasses, yearCalendarClasses } from "@mui/x-date-pickers";
import type { PickerComponents } from "@mui/x-date-pickers/themeAugmentation";
import { azul, brand, cinza, laranja, verde, vermelho } from "./paleta";
import { RAIOS, TOKENS_LAYOUT } from "./layout";

const ANEL_FOCO = (tema: Theme) =>
  `${TOKENS_LAYOUT.campo.foco}px solid ${tema.vars.palette.primary.main}`;

const inputs: Components<Theme> = {
  MuiButtonBase: {
    defaultProps: {
      disableTouchRipple: true,
      disableRipple: true,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        boxSizing: "border-box",
        transition: theme.transitions.create(["background-color", "border-color", "color"], {
          duration: 100,
        }),
        [`&.${buttonBaseClasses.focusVisible}`]: {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
        },
        "&[data-dia]:focus-visible": {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
        },
      }),
    },
  },
  MuiButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        boxShadow: "none",
        borderRadius: theme.shape.borderRadius,
        textTransform: "none",
        fontWeight: theme.typography.fontWeightMedium,
        variants: [
          {
            props: { size: "small" },
            style: { height: TOKENS_LAYOUT.botao.pequeno, padding: "8px 12px" },
          },
          {
            props: { size: "medium" },
            style: { height: TOKENS_LAYOUT.botao.medio, padding: "8px 16px" },
          },
          {
            props: { color: "inherit", variant: "contained" },
            style: {
              color: cinza[800],
              backgroundColor: cinza[100],
              border: `1px solid ${theme.vars.palette.bordaControle}`,
              "&:hover": { backgroundColor: cinza[200], boxShadow: "none" },
              "&:active": { backgroundColor: cinza[300] },
              ...theme.applyStyles("dark", {
                color: cinza[50],
                backgroundColor: cinza[800],
                "&:hover": { backgroundColor: cinza[700] },
                "&:active": { backgroundColor: cinza[600] },
              }),
              "&.Mui-disabled": {
                background: `${theme.vars.palette.action.disabledBackground} !important`,
                border: `1px solid ${theme.vars.palette.action.disabledBackground} !important`,
                color: theme.vars.palette.text.disabled,
                boxShadow: "none",
              },
            },
          },
          {
            props: ({ color, variant }) =>
              variant === "contained" && (color === "primary" || color === "secondary"),
            style: {
              color: brand[50],
              backgroundColor: brand[700],
              backgroundImage: "none",
              border: `1px solid ${brand[600]}`,
              boxShadow: "none",
              "&:hover": { backgroundColor: brand[800], boxShadow: "none" },
              "&:active": { backgroundColor: brand[900] },
            },
          },
          {
            props: { color: "error", variant: "contained" },
            style: {
              color: vermelho[50],
              backgroundColor: vermelho[400],
              border: `1px solid ${vermelho[400]}`,
              "&:hover": { backgroundColor: vermelho[500], boxShadow: "none" },
              "&:active": { backgroundColor: vermelho[600] },
              ...theme.applyStyles("dark", {
                backgroundColor: vermelho[500],
                borderColor: vermelho[500],
                "&:hover": { backgroundColor: vermelho[600] },
                "&:active": { backgroundColor: vermelho[700] },
              }),
            },
          },
          {
            props: { variant: "outlined" },
            style: {
              color: theme.vars.palette.text.primary,
              border: `1px solid ${cinza[200]}`,
              backgroundColor: alpha(cinza[50], 0.3),
              "&:hover": {
                backgroundColor: cinza[100],
                borderColor: cinza[300],
              },
              "&:active": { backgroundColor: cinza[200] },
              ...theme.applyStyles("dark", {
                backgroundColor: cinza[800],
                borderColor: cinza[700],
                "&:hover": {
                  backgroundColor: cinza[900],
                  borderColor: cinza[600],
                },
                "&:active": { backgroundColor: cinza[900] },
              }),
            },
          },
          {
            props: { color: "secondary", variant: "outlined" },
            style: {
              color: brand[700],
              border: `1px solid ${brand[200]}`,
              backgroundColor: brand[50],
              "&:hover": {
                backgroundColor: brand[100],
                borderColor: brand[400],
              },
              "&:active": { backgroundColor: alpha(brand[200], 0.7) },
              ...theme.applyStyles("dark", {
                color: brand[50],
                borderColor: brand[900],
                backgroundColor: alpha(brand[900], 0.3),
                "&:hover": {
                  borderColor: brand[700],
                  backgroundColor: alpha(brand[900], 0.6),
                },
                "&:active": { backgroundColor: alpha(brand[900], 0.5) },
              }),
            },
          },
          {
            props: { variant: "text" },
            style: {
              color: cinza[600],
              "&:hover": { backgroundColor: cinza[100] },
              "&:active": { backgroundColor: cinza[200] },
              ...theme.applyStyles("dark", {
                color: cinza[50],
                "&:hover": { backgroundColor: cinza[700] },
                "&:active": { backgroundColor: alpha(cinza[700], 0.7) },
              }),
            },
          },
          {
            props: { color: "secondary", variant: "text" },
            style: {
              color: brand[700],
              "&:hover": { backgroundColor: alpha(brand[100], 0.5) },
              "&:active": { backgroundColor: alpha(brand[200], 0.7) },
              ...theme.applyStyles("dark", {
                color: brand[100],
                "&:hover": { backgroundColor: alpha(brand[900], 0.5) },
                "&:active": { backgroundColor: alpha(brand[900], 0.3) },
              }),
            },
          },
        ],
      }),
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        boxShadow: "none",
        borderRadius: theme.shape.borderRadius,
        color: theme.vars.palette.text.primary,
        border: "1px solid transparent",
        backgroundColor: "transparent",
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover,
          borderColor: "transparent",
        },
        "&:active": { backgroundColor: theme.vars.palette.action.selected },
        variants: [
          {
            props: { size: "small" },
            style: {
              width: TOKENS_LAYOUT.botao.pequeno,
              height: TOKENS_LAYOUT.botao.pequeno,
              padding: 4,
              [`& .${svgIconClasses.root}`]: { fontSize: "1rem" },
            },
          },
          {
            props: { size: "medium" },
            style: {
              width: TOKENS_LAYOUT.botao.medio,
              height: TOKENS_LAYOUT.botao.medio,
              minWidth: 44,
              minHeight: 44,
            },
          },
        ],
      }),
    },
  },
  MuiToggleButtonGroup: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: RAIOS.dialogo,
        boxShadow: `0 4px 16px ${alpha(cinza[400], 0.2)}`,
        [`& .${toggleButtonGroupClasses.selected}`]: { color: brand[600] },
        ...theme.applyStyles("dark", {
          [`& .${toggleButtonGroupClasses.selected}`]: { color: "#fff" },
          boxShadow: `0 4px 16px ${alpha(brand[700], 0.5)}`,
        }),
      }),
    },
  },
  MuiToggleButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.alvoToque,
        padding: "12px 16px",
        textTransform: "none",
        borderRadius: RAIOS.dialogo,
        fontWeight: 500,
        ...theme.applyStyles("dark", {
          color: cinza[400],
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
          [`&.${toggleButtonClasses.selected}`]: { color: brand[300] },
        }),
      }),
    },
  },
  MuiInputBase: {
    styleOverrides: {
      root: { border: "none" },
      input: ({ theme }) => ({
        "&::placeholder": {
          opacity: 1,
          color: theme.vars.palette.text.secondary,
        },
      }),
    },
  },
  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.campo.medio,
        borderRadius: TOKENS_LAYOUT.campo.raio,
        backgroundColor: theme.vars.palette.background.paper,
        [`& .${outlinedInputClasses.notchedOutline}`]: {
          borderColor: theme.vars.palette.bordaControle,
          borderRadius: TOKENS_LAYOUT.campo.raio,
        },
        "&:hover:not(.Mui-error, .Mui-focused, .Mui-disabled) .MuiOutlinedInput-notchedOutline": {
          borderColor: cinza[600],
        },
        [`&.${outlinedInputClasses.focused}`]: {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.vars.palette.primary.main,
            borderWidth: 1,
          },
        },
        [`&.${outlinedInputClasses.error}`]: {
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.vars.palette.error.main,
          },
        },
        // No claro, action.disabled coincide com o fio do controle; o desabilitado recua.
        [`&.${outlinedInputClasses.disabled} .${outlinedInputClasses.notchedOutline}`]: {
          borderColor: cinza[300],
        },
        "&.MuiInputBase-multiline": { height: "auto", padding: 0 },
        [`&.${inputBaseClasses.sizeSmall} .${outlinedInputClasses.input}`]: {
          padding: "9px 12px",
        },
        ...theme.applyStyles("dark", {
          "&:hover:not(.Mui-error, .Mui-focused, .Mui-disabled) .MuiOutlinedInput-notchedOutline": {
            borderColor: cinza[400],
          },
          [`&.${outlinedInputClasses.error} .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.vars.palette.error.light,
          },
          // O escuro preserva o fio desabilitado padrão do MUI, já distinto do controle.
          [`&.${outlinedInputClasses.disabled} .${outlinedInputClasses.notchedOutline}`]: {
            borderColor: theme.vars.palette.action.disabled,
          },
        }),
        variants: [
          {
            props: { size: "small" },
            style: { minHeight: TOKENS_LAYOUT.campo.pequeno },
          },
          {
            props: { size: "medium" },
            style: { minHeight: TOKENS_LAYOUT.campo.medio },
          },
        ],
      }),
      input: ({ theme }) => ({
        padding: "16px 16px",
        ...theme.typography.body1,
      }),
      notchedOutline: { borderWidth: 1 },
    },
  },
  MuiInputAdornment: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.grey[500],
        ...theme.applyStyles("dark", { color: theme.vars.palette.grey[400] }),
      }),
    },
  },
  MuiFormLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        ...theme.typography.caption,
        "&:not(.MuiInputLabel-root)": { marginBottom: 8 },
      }),
    },
  },
  MuiInputLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.text.secondary,
      }),
    },
  },
  MuiFormHelperText: {
    styleOverrides: {
      root: ({ theme }) => ({
        marginLeft: 0,
        marginRight: 0,
        ...theme.typography.caption,
      }),
    },
  },
  MuiSelect: {
    defaultProps: {
      IconComponent: UnfoldMoreRoundedIcon,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: theme.shape.borderRadius,
        [`&.${selectClasses.focused}`]: { outlineOffset: 0 },
        "&:before, &:after": { display: "none" },
      }),
      select: {
        display: "flex",
        alignItems: "center",
        minHeight: 0,
      },
      icon: { color: cinza[500] },
    },
  },
  MuiAutocomplete: {
    styleOverrides: {
      paper: ({ theme }) => ({
        marginTop: 4,
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundImage: "none",
        boxShadow: "var(--template-palette-baseShadow)",
      }),
      option: {
        minHeight: TOKENS_LAYOUT.alvoToque,
        borderRadius: 6,
        margin: "2px 6px",
        [`&.${menuItemClasses.selected}`]: {
          backgroundColor: alpha(brand[500], 0.12),
        },
      },
      groupLabel: ({ theme }) => ({
        ...theme.typography.caption,
        color: theme.vars.palette.text.secondary,
      }),
      noOptions: ({ theme }) => ({
        color: theme.vars.palette.text.secondary,
        padding: 16,
      }),
      loading: ({ theme }) => ({
        color: theme.vars.palette.text.secondary,
        padding: 16,
      }),
    },
  },
};

const dataDisplay: Components<Theme> = {
  MuiList: {
    styleOverrides: {
      root: { padding: 8, display: "flex", flexDirection: "column", gap: 0 },
    },
  },
  MuiListItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.lista.umaLinha,
        [`& .${svgIconClasses.root}`]: {
          width: "1rem",
          height: "1rem",
          color: theme.vars.palette.text.secondary,
        },
      }),
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.navegacao,
        borderRadius: theme.shape.borderRadius,
        gap: 8,
        opacity: 0.82,
        [`&.${listItemButtonClasses.selected}`]: {
          opacity: 1,
          backgroundColor: alpha(brand[500], 0.14),
          "&:hover": { backgroundColor: alpha(brand[500], 0.2) },
        },
      }),
    },
  },
  MuiListItemIcon: {
    styleOverrides: {
      root: { minWidth: 0 },
    },
  },
  MuiListItemText: {
    styleOverrides: {
      primary: ({ theme }) => ({
        ...theme.typography.body2,
        fontWeight: 500,
      }),
      secondary: ({ theme }) => ({
        ...theme.typography.caption,
      }),
    },
  },
  MuiListSubheader: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: "transparent",
        padding: "4px 8px",
        ...theme.typography.caption,
        fontWeight: 500,
      }),
    },
  },
  MuiChip: {
    defaultProps: { size: "small" },
    styleOverrides: {
      root: ({ theme }) => ({
        height: 32,
        border: "1px solid",
        borderRadius: RAIOS.pilula,
        [`& .${chipClasses.label}`]: {
          fontWeight: 600,
          fontSize: theme.typography.caption.fontSize,
          paddingLeft: 10,
          paddingRight: 10,
        },
        variants: [
          {
            props: { color: "default" },
            style: {
              borderColor: cinza[200],
              backgroundColor: cinza[100],
              [`& .${chipClasses.label}`]: { color: cinza[500] },
              [`& .${chipClasses.icon}`]: { color: cinza[500] },
              ...theme.applyStyles("dark", {
                borderColor: cinza[700],
                backgroundColor: cinza[800],
                [`& .${chipClasses.label}`]: { color: cinza[300] },
                [`& .${chipClasses.icon}`]: { color: cinza[300] },
              }),
            },
          },
          {
            props: { color: "success" },
            style: {
              borderColor: verde[200],
              backgroundColor: verde[50],
              [`& .${chipClasses.label}`]: { color: verde[500] },
              [`& .${chipClasses.icon}`]: { color: verde[500] },
              ...theme.applyStyles("dark", {
                borderColor: verde[800],
                backgroundColor: verde[900],
                [`& .${chipClasses.label}`]: { color: verde[300] },
                [`& .${chipClasses.icon}`]: { color: verde[300] },
              }),
            },
          },
          {
            props: { color: "error" },
            style: {
              borderColor: vermelho[200],
              backgroundColor: vermelho[50],
              [`& .${chipClasses.label}`]: { color: vermelho[700] },
              [`& .${chipClasses.icon}`]: { color: vermelho[700] },
              ...theme.applyStyles("dark", {
                borderColor: vermelho[800],
                backgroundColor: vermelho[900],
                [`& .${chipClasses.label}`]: { color: vermelho[200] },
                [`& .${chipClasses.icon}`]: { color: vermelho[200] },
              }),
            },
          },
          {
            props: { color: "warning" },
            style: {
              borderColor: laranja[200],
              backgroundColor: laranja[50],
              [`& .${chipClasses.label}`]: { color: laranja[700] },
              [`& .${chipClasses.icon}`]: { color: laranja[700] },
              ...theme.applyStyles("dark", {
                borderColor: laranja[800],
                backgroundColor: laranja[900],
                [`& .${chipClasses.label}`]: { color: laranja[200] },
                [`& .${chipClasses.icon}`]: { color: laranja[200] },
              }),
            },
          },
          {
            props: { color: "info" },
            style: {
              borderColor: azul[200],
              backgroundColor: azul[50],
              [`& .${chipClasses.label}`]: { color: azul[700] },
              [`& .${chipClasses.icon}`]: { color: azul[700] },
              ...theme.applyStyles("dark", {
                borderColor: azul[800],
                backgroundColor: azul[900],
                [`& .${chipClasses.label}`]: { color: azul[200] },
                [`& .${chipClasses.icon}`]: { color: azul[200] },
              }),
            },
          },
          {
            props: { color: "primary" },
            style: {
              borderColor: brand[200],
              backgroundColor: brand[50],
              [`& .${chipClasses.label}`]: { color: brand[700] },
              ...theme.applyStyles("dark", {
                borderColor: brand[800],
                backgroundColor: brand[900],
                [`& .${chipClasses.label}`]: { color: brand[200] },
              }),
            },
          },
          {
            props: { color: "secondary" },
            style: {
              borderColor: brand[200],
              backgroundColor: brand[50],
              [`& .${chipClasses.label}`]: { color: brand[700] },
              ...theme.applyStyles("dark", {
                borderColor: brand[800],
                backgroundColor: brand[900],
                [`& .${chipClasses.label}`]: { color: brand[200] },
              }),
            },
          },
          {
            props: { size: "small" },
            style: {
              height: 24,
              [`& .${chipClasses.label}`]: { fontSize: theme.typography.caption.fontSize },
              [`& .${svgIconClasses.root}`]: { fontSize: 14 },
            },
          },
        ],
      }),
    },
  },
  MuiTable: {
    styleOverrides: {
      root: { borderCollapse: "separate", borderSpacing: 0 },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: ({ theme }) => ({
        "& .MuiTableCell-root": {
          height: TOKENS_LAYOUT.tabela.cabecalho,
          color: theme.vars.palette.text.secondary,
          backgroundColor: theme.vars.palette.background.paper,
          fontWeight: 600,
          whiteSpace: "nowrap",
        },
      }),
    },
  },
  MuiTableBody: {
    styleOverrides: {
      root: {
        "& .MuiTableRow-root": { height: TOKENS_LAYOUT.tabela.linha },
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({
        "&:hover": { backgroundColor: theme.vars.palette.action.hover },
        "&.Mui-selected": { backgroundColor: theme.vars.palette.action.selected },
      }),
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        padding: TOKENS_LAYOUT.tabela.padding,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        fontSize: theme.typography.body1.fontSize,
        lineHeight: 1.45,
      }),
      head: { fontWeight: 600 },
      sizeSmall: { padding: "8px 12px" },
    },
  },
  MuiTablePagination: {
    styleOverrides: {
      toolbar: { minHeight: TOKENS_LAYOUT.tabela.cabecalho },
      actions: {
        display: "flex",
        gap: 8,
        marginRight: 6,
      },
    },
  },
  MuiIcon: {
    defaultProps: { fontSize: "small" },
    styleOverrides: {
      root: {
        variants: [{ props: { fontSize: "small" }, style: { fontSize: "1rem" } }],
      },
    },
  },
  MuiSkeleton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: theme.shape.borderRadius,
        backgroundColor: theme.vars.palette.action.hover,
      }),
    },
  },
};

const feedback: Components<Theme> = {
  MuiAlert: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: RAIOS.dialogo,
        alignItems: "center",
        variants: [
          {
            props: { color: "success", variant: "standard" },
            style: {
              backgroundColor: verde[50],
              color: verde[700],
              border: `1px solid ${verde[200]}`,
              "& .MuiAlert-icon": { color: verde[600] },
              ...theme.applyStyles("dark", {
                backgroundColor: verde[900],
                color: verde[200],
                borderColor: verde[800],
                "& .MuiAlert-icon": { color: verde[300] },
              }),
            },
          },
          {
            props: { color: "error", variant: "standard" },
            style: {
              backgroundColor: vermelho[50],
              color: vermelho[700],
              border: `1px solid ${vermelho[200]}`,
              "& .MuiAlert-icon": { color: vermelho[500] },
              ...theme.applyStyles("dark", {
                backgroundColor: vermelho[900],
                color: vermelho[200],
                borderColor: vermelho[800],
                "& .MuiAlert-icon": { color: vermelho[300] },
              }),
            },
          },
          {
            props: { color: "warning", variant: "standard" },
            style: {
              backgroundColor: laranja[50],
              color: laranja[700],
              border: `1px solid ${laranja[200]}`,
              "& .MuiAlert-icon": { color: laranja[500] },
              ...theme.applyStyles("dark", {
                backgroundColor: laranja[900],
                color: laranja[200],
                borderColor: laranja[800],
                "& .MuiAlert-icon": { color: laranja[300] },
              }),
            },
          },
          {
            props: { color: "info", variant: "standard" },
            style: {
              backgroundColor: azul[50],
              color: azul[700],
              border: `1px solid ${azul[200]}`,
              "& .MuiAlert-icon": { color: azul[600] },
              ...theme.applyStyles("dark", {
                backgroundColor: azul[900],
                color: azul[200],
                borderColor: azul[800],
                "& .MuiAlert-icon": { color: azul[300] },
              }),
            },
          },
        ],
      }),
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        maxWidth: TOKENS_LAYOUT.dialogo.larguraMaxima,
        borderRadius: TOKENS_LAYOUT.dialogo.raio,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundImage: "none",
        "&:focus-visible": {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
        },
      }),
    },
  },
  MuiDialogTitle: {
    styleOverrides: {
      root: ({ theme }) => ({
        padding: `${TOKENS_LAYOUT.dialogo.padding}px ${TOKENS_LAYOUT.dialogo.padding}px 0`,
        ...theme.typography.h6,
      }),
    },
  },
  MuiDialogContent: {
    styleOverrides: {
      root: {
        padding: TOKENS_LAYOUT.dialogo.padding,
      },
    },
  },
  MuiDialogActions: {
    styleOverrides: {
      root: {
        padding: `0 ${TOKENS_LAYOUT.dialogo.padding}px ${TOKENS_LAYOUT.dialogo.padding}px`,
        gap: 8,
      },
    },
  },
  MuiSnackbarContent: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: theme.shape.borderRadius,
        backgroundColor: cinza[900],
        color: cinza[50],
        boxShadow: "var(--template-palette-baseShadow)",
        ...theme.applyStyles("dark", {
          backgroundColor: cinza[50],
          color: cinza[900],
        }),
      }),
    },
  },
  MuiLinearProgress: {
    styleOverrides: {
      root: ({ theme }) => ({
        height: 8,
        borderRadius: 8,
        backgroundColor: cinza[200],
        ...theme.applyStyles("dark", { backgroundColor: cinza[800] }),
      }),
    },
  },
};

const navigation: Components<Theme> = {
  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.botao.medio,
        "@media (min-width: 600px)": { minHeight: TOKENS_LAYOUT.alvoToque },
        borderRadius: theme.shape.borderRadius,
        padding: "6px 8px",
        [`&.${menuItemClasses.focusVisible}`]: { backgroundColor: "transparent" },
        [`&.${menuItemClasses.selected}`]: {
          backgroundColor: alpha(brand[500], 0.14),
          [`&.${menuItemClasses.focusVisible}`]: {
            backgroundColor: alpha(brand[500], 0.2),
          },
        },
      }),
    },
  },
  MuiMenu: {
    styleOverrides: {
      paper: ({ theme }) => ({
        marginTop: 4,
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundImage: "none",
        boxShadow: "var(--template-palette-baseShadow)",
      }),
      list: { padding: 6 },
    },
  },
  MuiLink: {
    defaultProps: { underline: "none" },
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.vars.palette.text.primary,
        fontWeight: 500,
        position: "relative",
        textDecoration: "none",
        width: "fit-content",
        "&::before": {
          content: '""',
          position: "absolute",
          width: "100%",
          height: "1px",
          bottom: 0,
          left: 0,
          backgroundColor: theme.vars.palette.text.secondary,
          opacity: 0.3,
          transition: "width 0.3s ease, opacity 0.3s ease",
        },
        "&:hover::before": { width: 0 },
        "&:focus-visible": {
          outline: `3px solid ${brand[500]}`,
          outlineOffset: 4,
          borderRadius: 2,
        },
      }),
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }) => ({
        width: TOKENS_LAYOUT.gaveta,
        backgroundColor: theme.vars.palette.background.default,
        borderRight: `1px solid ${theme.vars.palette.divider}`,
      }),
    },
  },
  MuiAppBar: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.barra.celular,
        backgroundColor: theme.vars.palette.background.paper,
        color: theme.vars.palette.text.primary,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        backgroundImage: "none",
        boxShadow: "none",
        "@media (min-width:600px)": { minHeight: TOKENS_LAYOUT.barra.desktop },
      }),
    },
  },
  MuiToolbar: {
    styleOverrides: {
      root: {
        minHeight: TOKENS_LAYOUT.barra.celular,
        paddingLeft: 16,
        paddingRight: 16,
        "@media (min-width:600px)": {
          minHeight: TOKENS_LAYOUT.barra.desktop,
          paddingLeft: 24,
          paddingRight: 24,
        },
      },
    },
  },
  MuiTabs: {
    styleOverrides: {
      root: { minHeight: TOKENS_LAYOUT.alvoToque },
      indicator: ({ theme }) => ({
        height: 3,
        backgroundColor: theme.vars.palette.grey[800],
        ...theme.applyStyles("dark", {
          backgroundColor: theme.vars.palette.grey[200],
        }),
      }),
    },
  },
  MuiTab: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: TOKENS_LAYOUT.alvoToque,
        padding: "8px 12px",
        marginBottom: 8,
        textTransform: "none",
        minWidth: "fit-content",
        color: theme.vars.palette.text.secondary,
        borderRadius: theme.shape.borderRadius,
        border: "1px solid transparent",
        "&:hover": {
          color: theme.vars.palette.text.primary,
          backgroundColor: cinza[100],
          borderColor: cinza[200],
        },
        [`&.${tabClasses.selected}`]: { color: cinza[900] },
        ...theme.applyStyles("dark", {
          "&:hover": {
            color: theme.vars.palette.text.primary,
            backgroundColor: cinza[800],
            borderColor: cinza[700],
          },
          [`&.${tabClasses.selected}`]: { color: "#fff" },
        }),
      }),
    },
  },
};

const surfaces: Components<Theme> = {
  MuiAccordion: {
    defaultProps: { elevation: 0, disableGutters: true },
    styleOverrides: {
      root: ({ theme }) => ({
        padding: 4,
        overflow: "clip",
        backgroundColor: theme.vars.palette.background.default,
        border: `1px solid ${theme.vars.palette.divider}`,
        "&:before": { backgroundColor: "transparent" },
        "&:not(:last-of-type)": { borderBottom: "none" },
        "&:first-of-type": {
          borderTopLeftRadius: theme.shape.borderRadius,
          borderTopRightRadius: theme.shape.borderRadius,
        },
        "&:last-of-type": {
          borderBottomLeftRadius: theme.shape.borderRadius,
          borderBottomRightRadius: theme.shape.borderRadius,
        },
      }),
    },
  },
  MuiAccordionSummary: {
    styleOverrides: {
      root: ({ theme }) => ({
        border: "none",
        borderRadius: theme.shape.borderRadius,
        "&:hover": { backgroundColor: cinza[50] },
        "&:focus-visible": { backgroundColor: "transparent" },
        ...theme.applyStyles("dark", {
          "&:hover": { backgroundColor: cinza[800] },
        }),
      }),
    },
  },
  MuiAccordionDetails: {
    styleOverrides: {
      root: { marginBottom: 20, border: "none" },
    },
  },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { backgroundImage: "none" },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: ({ theme }) => ({
        padding: TOKENS_LAYOUT.cartao.padding,
        borderRadius: TOKENS_LAYOUT.cartao.raio,
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`,
        boxShadow: "none",
      }),
    },
  },
  MuiCardContent: {
    styleOverrides: {
      root: {
        padding: 0,
        "&:last-child": { paddingBottom: 0 },
      },
    },
  },
  MuiCardHeader: {
    styleOverrides: {
      root: { padding: 0 },
    },
  },
  MuiCardActions: {
    styleOverrides: {
      root: { padding: 0, gap: 8 },
    },
  },
  MuiSwitch: {
    styleOverrides: {
      root: {
        width: 58,
        height: TOKENS_LAYOUT.alvoToque,
        padding: "17px 12px",
        overflow: "visible",
      },
      switchBase: ({ theme }) => ({
        padding: 14,
        color: cinza[50],
        [`&.${switchClasses.checked}`]: {
          color: cinza[50],
          transform: "translateX(20px)",
          [`& + .${switchClasses.track}`]: {
            backgroundColor: theme.vars.palette.primary.main,
            opacity: 1,
            border: 0,
          },
          [`&.${switchClasses.disabled} + .${switchClasses.track}`]: {
            opacity: 0.5,
          },
        },
      }),
      thumb: {
        width: 20,
        height: 20,
        boxShadow: "0 1px 3px hsla(220, 30%, 5%, 0.3)",
      },
      track: {
        borderRadius: 7,
        backgroundColor: cinza[300],
        opacity: 1,
      },
    },
  },
  MuiTooltip: {
    defaultProps: { arrow: true },
    styleOverrides: {
      tooltip: ({ theme }) => ({
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: theme.typography.caption.fontSize,
        backgroundColor: cinza[900],
        color: cinza[50],
        ...theme.applyStyles("dark", {
          backgroundColor: cinza[50],
          color: cinza[900],
        }),
      }),
      arrow: ({ theme }) => ({
        color: cinza[900],
        ...theme.applyStyles("dark", { color: cinza[50] }),
      }),
    },
  },
  MuiDivider: {
    styleOverrides: {
      root: ({ theme }) => ({ borderColor: theme.vars.palette.divider }),
    },
  },
};

const chartsCustomizations: ChartsComponents<Theme> = {
  MuiChartsAxis: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`& .${axisClasses.line}`]: { stroke: cinza[300] },
        [`& .${axisClasses.tick}`]: { stroke: cinza[300] },
        [`& .${axisClasses.tickLabel}`]: { fill: cinza[500], fontWeight: 500 },
        ...theme.applyStyles("dark", {
          [`& .${axisClasses.line}`]: { stroke: cinza[700] },
          [`& .${axisClasses.tick}`]: { stroke: cinza[700] },
          [`& .${axisClasses.tickLabel}`]: { fill: cinza[300], fontWeight: 500 },
        }),
      }),
    },
  },
  MuiChartsTooltip: {
    styleOverrides: {
      mark: ({ theme }) => ({
        boxShadow: "none",
        border: `1px solid ${theme.vars.palette.divider}`,
      }),
      table: ({ theme }) => ({
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: theme.shape.borderRadius,
        background: theme.vars.palette.background.paper,
      }),
    },
  },
  MuiChartsLegend: {
    styleOverrides: {
      root: {
        [`& .${legendClasses.mark}`]: { ry: 6 },
      },
    },
  },
  MuiChartsGrid: {
    styleOverrides: {
      root: ({ theme }) => ({
        [`& .${chartsGridClasses.line}`]: {
          stroke: cinza[200],
          strokeDasharray: "4 2",
          strokeWidth: 0.8,
        },
        ...theme.applyStyles("dark", {
          [`& .${chartsGridClasses.line}`]: {
            stroke: cinza[700],
            strokeDasharray: "4 2",
            strokeWidth: 0.8,
          },
        }),
      }),
    },
  },
};

const datePickersCustomizations: PickerComponents<Theme> = {
  MuiPickerPopper: {
    styleOverrides: {
      paper: ({ theme }) => ({
        marginTop: 4,
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundImage: "none",
        background: theme.vars.palette.background.paper,
        boxShadow: "var(--template-palette-baseShadow)",
        [`& .${menuItemClasses.root}`]: { borderRadius: 6, margin: "0 6px" },
      }),
    },
  },
  MuiPickersArrowSwitcher: {
    styleOverrides: {
      spacer: { width: 16 },
      button: ({ theme }) => ({
        backgroundColor: "transparent",
        color: theme.vars.palette.grey[500],
        ...theme.applyStyles("dark", { color: theme.vars.palette.grey[400] }),
      }),
    },
  },
  MuiPickersCalendarHeader: {
    styleOverrides: {
      switchViewButton: { padding: 0, border: "none" },
    },
  },
  MuiMonthCalendar: {
    styleOverrides: {
      button: ({ theme }) => ({
        fontSize: theme.typography.body1.fontSize,
        color: theme.vars.palette.grey[600],
        padding: theme.spacing(0.5),
        borderRadius: theme.shape.borderRadius,
        "&:hover": { backgroundColor: theme.vars.palette.action.hover },
        [`&.${monthCalendarClasses.selected}`]: {
          backgroundColor: cinza[700],
          fontWeight: theme.typography.fontWeightMedium,
        },
        "&:focus": {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
          backgroundColor: "transparent",
        },
        ...theme.applyStyles("dark", {
          color: theme.vars.palette.grey[300],
          [`&.${monthCalendarClasses.selected}`]: {
            color: theme.vars.palette.common.black,
            backgroundColor: cinza[300],
          },
        }),
      }),
    },
  },
  MuiYearCalendar: {
    styleOverrides: {
      button: ({ theme }) => ({
        fontSize: theme.typography.body1.fontSize,
        color: theme.vars.palette.grey[600],
        padding: theme.spacing(0.5),
        borderRadius: theme.shape.borderRadius,
        height: "fit-content",
        "&:hover": { backgroundColor: theme.vars.palette.action.hover },
        [`&.${yearCalendarClasses.selected}`]: {
          backgroundColor: cinza[700],
          fontWeight: theme.typography.fontWeightMedium,
        },
        "&:focus": {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
          backgroundColor: "transparent",
        },
        ...theme.applyStyles("dark", {
          color: theme.vars.palette.grey[300],
          [`&.${yearCalendarClasses.selected}`]: {
            color: theme.vars.palette.common.black,
            backgroundColor: cinza[300],
          },
        }),
      }),
    },
  },
  MuiPickerDay: {
    styleOverrides: {
      root: ({ theme }) => ({
        fontSize: theme.typography.body1.fontSize,
        color: theme.vars.palette.grey[600],
        padding: theme.spacing(0.5),
        borderRadius: theme.shape.borderRadius,
        "&:hover": { backgroundColor: theme.vars.palette.action.hover },
        [`&.${pickerDayClasses.selected}`]: {
          backgroundColor: cinza[700],
          fontWeight: theme.typography.fontWeightMedium,
        },
        "&:focus": {
          outline: ANEL_FOCO(theme),
          outlineOffset: 2,
          backgroundColor: "transparent",
        },
        ...theme.applyStyles("dark", {
          color: theme.vars.palette.grey[300],
          [`&.${pickerDayClasses.selected}`]: {
            color: theme.vars.palette.common.black,
            backgroundColor: cinza[300],
          },
        }),
      }),
    },
  },
};

export const componentes: Components<Theme> = {
  ...inputs,
  ...dataDisplay,
  ...feedback,
  ...navigation,
  ...surfaces,
  ...chartsCustomizations,
  ...datePickersCustomizations,
};
