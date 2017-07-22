function fish_prompt
  if [ $status -eq 0 ]
    # whale
    set prompt_face \U1F433
  else
    # thinking face
    set prompt_face \U1F914
  end

  # set_color FD8724
  echo -n $prompt_face
  echo -n '  '
  set_color normal
end
