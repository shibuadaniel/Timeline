import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import Autocomplete from "@mui/material/Autocomplete";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";

const checkboxIcon = (
  <CheckBoxOutlineBlankIcon sx={{ fontSize: 18 }} />
);
const checkboxCheckedIcon = <CheckBoxIcon sx={{ fontSize: 18 }} />;

type StageMultiselectFieldProps = {
  label: string;
  /** Empty = no filter (all). */
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function StageMultiselectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: StageMultiselectFieldProps) {
  return (
    <Autocomplete
      multiple
      disabled={disabled}
      options={options}
      value={value}
      onChange={(_, next) => onChange(next)}
      disableCloseOnSelect
      getOptionLabel={(o) => o}
      isOptionEqualToValue={(a, b) => a === b}
      limitTags={2}
      renderOption={(props, option, { selected }) => {
        const { key, ...optionProps } = props;
        return (
          <li key={key} {...optionProps}>
            <Checkbox
              icon={checkboxIcon}
              checkedIcon={checkboxCheckedIcon}
              checked={selected}
              size="small"
              sx={{ p: 0.25, mr: 0.75 }}
            />
            {option}
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length === 0 ? "All" : undefined}
        />
      )}
      sx={{ minWidth: 260 }}
    />
  );
}
